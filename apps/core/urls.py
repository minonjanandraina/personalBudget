from django.urls import path

from . import views

app_name = "core"

urlpatterns = [
    path("", views.home, name="home"),
    path("alertes/", views.alertes, name="alertes"),
    path("solde-om/", views.SoldeListView.as_view(), name="solde_list"),
    path("solde-om/nouveau/", views.SoldeCreateView.as_view(), name="solde_create"),
    path("solde-om/<int:pk>/supprimer/", views.SoldeDeleteView.as_view(), name="solde_delete"),
    path("parametres/", views.ParametreUpdateView.as_view(), name="parametres"),
]
