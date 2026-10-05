from django import forms

from apps.core.htmx import StyledFormMixin

from .models import Budget, TypeBudget


class TypeBudgetForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = TypeBudget
        fields = ["name"]


class BudgetForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = Budget
        fields = [
            "name", "type", "montant_budget", "montant_max",
            "montant_min", "solde_alert", "autogen_fin_mois",
        ]
        help_texts = {
            "montant_min": "Solde minimal exigé du budget après une allocation.",
            "solde_alert": "Une alerte est levée si le solde du budget passe sous ce seuil.",
            "autogen_fin_mois": "Le job crée automatiquement l'allocation du mois.",
        }

    def clean(self):
        data = super().clean()
        budget, maxi, mini = (
            data.get("montant_budget"), data.get("montant_max"), data.get("montant_min"),
        )
        if maxi is not None and mini is not None and mini > maxi:
            self.add_error("montant_min", "Doit être inférieur ou égal au plafond.")
        if maxi is not None and budget is not None and budget > maxi:
            self.add_error("montant_budget", "Ne peut pas dépasser le plafond du budget.")
        return data
