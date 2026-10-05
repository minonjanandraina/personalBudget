import uuid

from django.db import models
from django.db.models import Q

from apps.budgets.models import AllocationBudget


class Transaction(models.Model):
    class InsertType(models.TextChoices):
        MANUEL = "manuel", "Manuel"
        AUTO = "auto", "Automatique (SMS)"

    class DebitCredit(models.IntegerChoices):
        DEPENSE = -1, "Dépense"
        ALIMENTATION = 1, "Alimentation"

    trx_id = models.CharField(
        "ID transaction", max_length=50, unique=True, blank=True
    )
    # Nulle tant qu'une transaction issue d'un SMS n'est pas classée dans un budget.
    allocation = models.ForeignKey(
        AllocationBudget,
        on_delete=models.PROTECT,
        related_name="transactions",
        null=True,
        blank=True,
    )
    insert_type = models.CharField(
        max_length=10, choices=InsertType.choices, default=InsertType.MANUEL
    )
    debit_credit = models.SmallIntegerField(choices=DebitCredit.choices)
    montant = models.PositiveBigIntegerField()
    sms = models.TextField("SMS d'origine", null=True, blank=True)
    insert_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-insert_date", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(debit_credit__in=[-1, 1]),
                name="transaction_debit_credit_valide",
            ),
            models.CheckConstraint(
                condition=Q(montant__gt=0), name="transaction_montant_positif"
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.trx_id:
            self.trx_id = f"MAN-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

    @property
    def montant_signe(self):
        return self.debit_credit * self.montant

    def __str__(self):
        return f"{self.trx_id} {self.montant_signe:+d} Ar"
