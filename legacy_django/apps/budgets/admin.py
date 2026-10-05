from django.contrib import admin

from .models import AllocationBudget, Budget, TypeBudget


@admin.register(TypeBudget)
class TypeBudgetAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "insert_date")


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = (
        "name", "type", "montant_budget", "montant_max",
        "montant_min", "solde_alert", "autogen_fin_mois",
    )
    list_filter = ("type", "autogen_fin_mois")


@admin.register(AllocationBudget)
class AllocationBudgetAdmin(admin.ModelAdmin):
    list_display = ("budget", "date_from", "date_to", "montant_alloue")
    list_filter = ("budget",)
