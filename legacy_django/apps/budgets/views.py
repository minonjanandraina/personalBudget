from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.messages.views import SuccessMessageMixin
from django.urls import reverse_lazy
from django.views.generic import CreateView, ListView, UpdateView

from apps.core.htmx import HtmxFormMixin, ProtectedDeleteView

from .forms import BudgetForm, TypeBudgetForm
from .models import Budget, TypeBudget

# --- Types de budget -------------------------------------------------------


class TypeBudgetListView(LoginRequiredMixin, ListView):
    model = TypeBudget
    template_name = "budgets/type_list.html"
    context_object_name = "types"


class TypeBudgetCreateView(HtmxFormMixin, SuccessMessageMixin, CreateView):
    model = TypeBudget
    form_class = TypeBudgetForm
    title = "Nouveau type de budget"
    success_url = reverse_lazy("budgets:type_list")
    success_message = "Type de budget créé."


class TypeBudgetUpdateView(HtmxFormMixin, SuccessMessageMixin, UpdateView):
    model = TypeBudget
    form_class = TypeBudgetForm
    title = "Modifier le type de budget"
    success_url = reverse_lazy("budgets:type_list")
    success_message = "Type de budget modifié."


class TypeBudgetDeleteView(ProtectedDeleteView):
    model = TypeBudget
    success_url = reverse_lazy("budgets:type_list")
    success_message = "Type de budget supprimé."
    protected_message = "Suppression impossible : des budgets utilisent ce type."


# --- Budgets ---------------------------------------------------------------


class BudgetListView(LoginRequiredMixin, ListView):
    model = Budget
    template_name = "budgets/budget_list.html"
    context_object_name = "budgets"
    queryset = Budget.objects.select_related("type")


class BudgetCreateView(HtmxFormMixin, SuccessMessageMixin, CreateView):
    model = Budget
    form_class = BudgetForm
    title = "Nouveau budget"
    success_url = reverse_lazy("budgets:list")
    success_message = "Budget créé."


class BudgetUpdateView(HtmxFormMixin, SuccessMessageMixin, UpdateView):
    model = Budget
    form_class = BudgetForm
    title = "Modifier le budget"
    success_url = reverse_lazy("budgets:list")
    success_message = "Budget modifié."


class BudgetDeleteView(ProtectedDeleteView):
    model = Budget
    success_url = reverse_lazy("budgets:list")
    success_message = "Budget supprimé."
    protected_message = "Suppression impossible : ce budget a des allocations."
