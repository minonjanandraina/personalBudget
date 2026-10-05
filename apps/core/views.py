from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.shortcuts import render
from django.urls import reverse, reverse_lazy
from django.views.generic import CreateView, ListView, UpdateView

from .forms import ParametreJobForm, SoldeOMForm
from .htmx import HtmxFormMixin, ProtectedDeleteView
from .models import ParametreJob, SoldeOM


def build_tiles():
    """Tuiles du tableau de bord ; "url" vide = écran pas encore disponible."""
    return [
        {"label": "Budgets", "icon": "bi-wallet2", "color": "bg-blue", "url": reverse("budgets:list")},
        {"label": "Allocations", "icon": "bi-calendar-check-fill", "color": "bg-green", "url": None},
        {"label": "Transactions", "icon": "bi-arrow-left-right", "color": "bg-orange", "url": None},
        {"label": "Types de budget", "icon": "bi-tags-fill", "color": "bg-purple", "url": reverse("budgets:type_list")},
        {"label": "Solde OM", "icon": "bi-phone-fill", "color": "bg-red", "url": reverse("core:solde_list")},
        {"label": "Paramètres", "icon": "bi-gear-fill", "color": "bg-gray", "url": reverse("core:parametres")},
    ]


@login_required
def home(request):
    return render(
        request, "core/home.html", {"solde": SoldeOM.objects.first(), "tiles": build_tiles()}
    )


@login_required
def alertes(request):
    """Fragment HTMX des alertes (alimenté à partir du sprint 6)."""
    return render(request, "core/partials/alertes.html", {"alertes": []})


# --- Solde Orange Money ----------------------------------------------------


class SoldeListView(LoginRequiredMixin, ListView):
    model = SoldeOM
    template_name = "core/solde_list.html"
    context_object_name = "soldes"
    paginate_by = 30


class SoldeCreateView(HtmxFormMixin, SuccessMessageMixin, CreateView):
    model = SoldeOM
    form_class = SoldeOMForm
    title = "Saisir le solde OM"
    success_url = reverse_lazy("core:solde_list")
    success_message = "Solde enregistré."


class SoldeDeleteView(ProtectedDeleteView):
    model = SoldeOM
    success_url = reverse_lazy("core:solde_list")
    success_message = "Solde supprimé."


# --- Paramètres ------------------------------------------------------------


class ParametreUpdateView(HtmxFormMixin, SuccessMessageMixin, UpdateView):
    form_class = ParametreJobForm
    title = "Paramètres du job"
    success_url = reverse_lazy("core:home")
    success_message = "Paramètres enregistrés."

    def get_object(self, queryset=None):
        return ParametreJob.load()
