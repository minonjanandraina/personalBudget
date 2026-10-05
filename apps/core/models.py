from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class SoldeOM(models.Model):
    """Solde du compte Orange Money (à chaque SMS ou consultation)."""

    datetime = models.DateTimeField("date/heure du solde")
    balance = models.BigIntegerField("solde disponible")
    insert_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "solde OM"
        verbose_name_plural = "soldes OM"
        ordering = ["-datetime", "-id"]

    def __str__(self):
        return f"{self.balance} Ar au {self.datetime:%d/%m/%Y %H:%M}"


class ParametreJob(models.Model):
    """Paramètres du job d'allocation : une seule ligne (pk=1)."""

    start_day_int = models.PositiveSmallIntegerField(
        "jour de lancement du job",
        default=20,
        validators=[MinValueValidator(1), MaxValueValidator(28)],
    )

    class Meta:
        verbose_name = "paramètre job"
        verbose_name_plural = "paramètre job"

    def save(self, *args, **kwargs):
        self.pk = 1
        kwargs["force_insert"] = False  # écrase la ligne existante (create() inclus)
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # la ligne unique ne peut pas être supprimée

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"Job d'allocation le {self.start_day_int} de chaque mois"
