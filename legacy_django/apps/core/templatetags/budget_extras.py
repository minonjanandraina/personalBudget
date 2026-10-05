from django import template

register = template.Library()


@register.filter
def ar(value):
    """Formate un montant entier : 1234567 -> '1 234 567 Ar'."""
    if value is None or value == "":
        return "—"
    return f"{int(value):,}".replace(",", " ") + " Ar"
