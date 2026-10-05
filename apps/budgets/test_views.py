from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import AllocationBudget, Budget, TypeBudget

HX = {"HTTP_HX_REQUEST": "true"}


class LoggedTestCase(TestCase):
    def setUp(self):
        get_user_model().objects.create_user("moi", password="x")
        self.client.login(username="moi", password="x")


class ProtectionTests(TestCase):
    def test_ecrans_proteges(self):
        for name in ("budgets:list", "budgets:create", "budgets:type_list", "budgets:type_create"):
            self.assertEqual(self.client.get(reverse(name)).status_code, 302, name)


class TypeBudgetViewsTests(LoggedTestCase):
    def test_creation_classique(self):
        response = self.client.post(reverse("budgets:type_create"), {"name": "Loisir"})
        self.assertRedirects(response, reverse("budgets:type_list"))
        self.assertEqual(TypeBudget.objects.get().code, "bdg-001")

    def test_creation_htmx_redirige_par_header(self):
        response = self.client.post(reverse("budgets:type_create"), {"name": "Loisir"}, **HX)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response["HX-Redirect"], reverse("budgets:type_list"))

    def test_erreur_htmx_retourne_fragment(self):
        response = self.client.post(reverse("budgets:type_create"), {"name": ""}, **HX)
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "<html")
        self.assertContains(response, "obligatoire")

    def test_modification(self):
        t = TypeBudget.objects.create(name="A")
        self.client.post(reverse("budgets:type_update", args=[t.pk]), {"name": "B"})
        t.refresh_from_db()
        self.assertEqual((t.name, t.code), ("B", "bdg-001"))

    def test_suppression(self):
        t = TypeBudget.objects.create(name="A")
        response = self.client.post(reverse("budgets:type_delete", args=[t.pk]), **HX)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TypeBudget.objects.exists())

    def test_suppression_refusee_si_utilise(self):
        t = TypeBudget.objects.create(name="A")
        Budget.objects.create(name="B", type=t, montant_budget=1, montant_max=2)
        self.client.post(reverse("budgets:type_delete", args=[t.pk]), **HX)
        self.assertTrue(TypeBudget.objects.exists())
        page = self.client.get(reverse("budgets:type_list"))
        self.assertContains(page, "Suppression impossible")

    def test_suppression_par_get_interdite(self):
        t = TypeBudget.objects.create(name="A")
        self.assertEqual(self.client.get(reverse("budgets:type_delete", args=[t.pk])).status_code, 405)


class BudgetViewsTests(LoggedTestCase):
    def setUp(self):
        super().setUp()
        self.type = TypeBudget.objects.create(name="Loisir")

    def data(self, **kw):
        d = {
            "name": "Sorties", "type": self.type.pk, "montant_budget": 100000,
            "montant_max": 150000, "montant_min": 0, "solde_alert": 10000,
        }
        d.update(kw)
        return d

    def test_creation(self):
        r = self.client.post(reverse("budgets:create"), self.data(autogen_fin_mois="on"))
        self.assertRedirects(r, reverse("budgets:list"))
        b = Budget.objects.get()
        self.assertTrue(b.autogen_fin_mois)

    def test_min_superieur_au_max_refuse(self):
        r = self.client.post(reverse("budgets:create"), self.data(montant_min=200000))
        self.assertContains(r, "inférieur ou égal au plafond")
        self.assertFalse(Budget.objects.exists())

    def test_montant_budget_superieur_au_plafond_refuse(self):
        r = self.client.post(reverse("budgets:create"), self.data(montant_budget=200000))
        self.assertContains(r, "dépasser le plafond")

    def test_montants_negatifs_refuses(self):
        r = self.client.post(reverse("budgets:create"), self.data(solde_alert=-5))
        self.assertEqual(r.status_code, 200)
        self.assertFalse(Budget.objects.exists())

    def test_liste_affiche_montants_formates(self):
        Budget.objects.create(name="X", type=self.type, montant_budget=100000, montant_max=150000)
        r = self.client.get(reverse("budgets:list"))
        self.assertContains(r, "100 000 Ar")

    def test_suppression_refusee_si_allocations(self):
        b = Budget.objects.create(name="X", type=self.type, montant_budget=1, montant_max=2)
        AllocationBudget.objects.create(
            budget=b, date_from=date(2026, 10, 1), date_to=date(2026, 10, 31), montant_alloue=1
        )
        self.client.post(reverse("budgets:delete", args=[b.pk]))
        self.assertTrue(Budget.objects.exists())
