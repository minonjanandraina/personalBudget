from django.db import models
from django.db.models import F, Q


class TypeBudget(models.Model):
    code = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField("nom", max_length=100)
    insert_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "type de budget"
        verbose_name_plural = "types de budget"
        ordering = ["code"]

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self._next_code()
        super().save(*args, **kwargs)

    @classmethod
    def _next_code(cls):
        last = cls.objects.order_by("-code").values_list("code", flat=True).first()
        number = int(last.split("-")[1]) + 1 if last else 1
        return f"bdg-{number:03d}"

    def __str__(self):
        return f"{self.code} — {self.name}"


class Budget(models.Model):
    name = models.CharField("nom", max_length=100)
    type = models.ForeignKey(
        TypeBudget, on_delete=models.PROTECT, related_name="budgets"
    )
    montant_budget = models.PositiveBigIntegerField("montant alloué par mois")
    montant_max = models.PositiveBigIntegerField("plafond du budget")
    montant_min = models.PositiveBigIntegerField(
        "solde minimal après allocation", default=0
    )
    solde_alert = models.PositiveBigIntegerField("seuil d'alerte", default=0)
    autogen_fin_mois = models.BooleanField(
        "allocation automatique en fin de mois", default=False
    )
    insert_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(montant_min__lte=F("montant_max")),
                name="budget_min_lte_max",
            ),
        ]

    def __str__(self):
        return self.name


class AllocationBudget(models.Model):
    budget = models.ForeignKey(
        Budget, on_delete=models.PROTECT, related_name="allocations"
    )
    date_from = models.DateField("début")
    date_to = models.DateField("fin")
    montant_alloue = models.PositiveBigIntegerField("montant alloué")
    insert_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "allocation de budget"
        verbose_name_plural = "allocations de budget"
        ordering = ["-date_from", "budget__name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(date_to__gte=F("date_from")),
                name="allocation_dates_coherentes",
            ),
            models.UniqueConstraint(
                fields=["budget", "date_from"], name="allocation_unique_par_periode"
            ),
        ]

    def __str__(self):
        return f"{self.budget} {self.date_from:%d/%m/%Y} → {self.date_to:%d/%m/%Y}"
