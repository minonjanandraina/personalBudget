from django.urls import path

from . import views

app_name = "budgets"

urlpatterns = [
    path("", views.BudgetListView.as_view(), name="list"),
    path("nouveau/", views.BudgetCreateView.as_view(), name="create"),
    path("<int:pk>/modifier/", views.BudgetUpdateView.as_view(), name="update"),
    path("<int:pk>/supprimer/", views.BudgetDeleteView.as_view(), name="delete"),
    path("types/", views.TypeBudgetListView.as_view(), name="type_list"),
    path("types/nouveau/", views.TypeBudgetCreateView.as_view(), name="type_create"),
    path("types/<int:pk>/modifier/", views.TypeBudgetUpdateView.as_view(), name="type_update"),
    path("types/<int:pk>/supprimer/", views.TypeBudgetDeleteView.as_view(), name="type_delete"),
]
