"""Briques communes aux écrans CRUD : formulaires HTMX, suppression protégée."""

from django import forms
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import ProtectedError
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.views import View


def is_htmx(request):
    return request.headers.get("HX-Request") == "true"


def hx_redirect(url):
    return HttpResponse(status=204, headers={"HX-Redirect": str(url)})


class StyledFormMixin:
    """Ajoute les classes Bootstrap aux widgets (champs tactiles)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            widget = field.widget
            if isinstance(widget, forms.CheckboxInput):
                widget.attrs.setdefault("class", "form-check-input")
            elif isinstance(widget, forms.Select):
                widget.attrs.setdefault("class", "form-select")
            else:
                widget.attrs.setdefault("class", "form-control")
            if isinstance(widget, forms.NumberInput):
                widget.attrs.setdefault("inputmode", "numeric")


class HtmxFormMixin(LoginRequiredMixin):
    """Formulaire soumis par HTMX : le fragment est ré-affiché avec ses erreurs,
    et un succès redirige (HX-Redirect) vers success_url."""

    template_name = "crud/form.html"
    partial_template_name = "crud/_form.html"
    title = ""

    def get_template_names(self):
        if is_htmx(self.request) and self.request.method == "POST":
            return [self.partial_template_name]
        return [self.template_name]

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["title"] = self.title
        ctx["cancel_url"] = str(self.success_url)
        return ctx

    def form_valid(self, form):
        response = super().form_valid(form)
        if is_htmx(self.request):
            return hx_redirect(response.url)
        return response


class ProtectedDeleteView(LoginRequiredMixin, View):
    """Suppression par POST ; refuse proprement si l'objet est référencé."""

    model = None
    success_url = None
    success_message = "Élément supprimé."
    protected_message = "Suppression impossible : cet élément est utilisé."

    http_method_names = ["post"]

    def post(self, request, pk):
        obj = get_object_or_404(self.model, pk=pk)
        try:
            obj.delete()
        except ProtectedError:
            messages.error(request, self.protected_message)
        else:
            messages.success(request, self.success_message)
        url = str(self.success_url)
        return hx_redirect(url) if is_htmx(request) else HttpResponseRedirect(url)
