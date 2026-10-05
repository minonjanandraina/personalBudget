from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from .models import SoldeOM

# Tuiles du tableau de bord ; "url" vide = écran pas encore disponible (sprints suivants).
TILES = [
    {"label": "Budgets", "icon": "bi-wallet2", "color": "bg-blue", "url": None},
    {"label": "Allocations", "icon": "bi-calendar-check-fill", "color": "bg-green", "url": None},
    {"label": "Transactions", "icon": "bi-arrow-left-right", "color": "bg-orange", "url": None},
    {"label": "Types de budget", "icon": "bi-tags-fill", "color": "bg-purple", "url": None},
    {"label": "Solde OM", "icon": "bi-phone-fill", "color": "bg-red", "url": None},
    {"label": "Paramètres", "icon": "bi-gear-fill", "color": "bg-gray", "url": None},
]


@login_required
def home(request):
    return render(
        request, "core/home.html", {"solde": SoldeOM.objects.first(), "tiles": TILES}
    )


@login_required
def alertes(request):
    """Fragment HTMX des alertes (alimenté à partir du sprint 6)."""
    return render(request, "core/partials/alertes.html", {"alertes": []})
