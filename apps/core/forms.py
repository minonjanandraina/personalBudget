from datetime import timedelta

from django import forms
from django.utils import timezone

from .htmx import StyledFormMixin
from .models import ParametreJob, SoldeOM

DATETIME_LOCAL = "%Y-%m-%dT%H:%M"


class SoldeOMForm(StyledFormMixin, forms.ModelForm):
    datetime = forms.DateTimeField(
        label="Date et heure du solde",
        input_formats=[DATETIME_LOCAL, "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"],
        widget=forms.DateTimeInput(attrs={"type": "datetime-local"}, format=DATETIME_LOCAL),
    )

    class Meta:
        model = SoldeOM
        fields = ["datetime", "balance"]
        labels = {"balance": "Solde disponible (Ar)"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.is_bound:
            self.initial.setdefault(
                "datetime", timezone.localtime().replace(second=0, microsecond=0)
            )

    def clean_balance(self):
        balance = self.cleaned_data["balance"]
        if balance < 0:
            raise forms.ValidationError("Le solde ne peut pas être négatif.")
        return balance

    def clean_datetime(self):
        dt = self.cleaned_data["datetime"]
        if dt > timezone.now() + timedelta(minutes=5):
            raise forms.ValidationError("La date ne peut pas être dans le futur.")
        return dt


class ParametreJobForm(StyledFormMixin, forms.ModelForm):
    class Meta:
        model = ParametreJob
        fields = ["start_day_int"]
        labels = {"start_day_int": "Jour du mois"}
        help_texts = {
            "start_day_int": "Le job d'allocation / réallocation se lance ce jour-là chaque mois (1 à 28)."
        }
