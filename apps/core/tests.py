from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class HomeTests(TestCase):
    def test_home_requires_login(self):
        response = self.client.get(reverse("core:home"))
        self.assertRedirects(response, "/login/?next=/")

    def test_home_for_logged_user(self):
        get_user_model().objects.create_user("moi", password="x")
        self.client.login(username="moi", password="x")
        response = self.client.get(reverse("core:home"))
        self.assertContains(response, "Gestion de Budget")


class ParametreJobTests(TestCase):
    def test_ligne_unique(self):
        from .models import ParametreJob

        ParametreJob.objects.create(start_day_int=10)
        ParametreJob.objects.create(start_day_int=15)
        self.assertEqual(ParametreJob.objects.count(), 1)
        self.assertEqual(ParametreJob.load().start_day_int, 15)

    def test_suppression_ignoree(self):
        from .models import ParametreJob

        ParametreJob.load().delete()
        self.assertEqual(ParametreJob.objects.count(), 1)

    def test_valeur_par_defaut(self):
        from .models import ParametreJob

        self.assertEqual(ParametreJob.load().start_day_int, 20)


class AuthTests(TestCase):
    def setUp(self):
        get_user_model().objects.create_user("moi", password="secret123")

    def test_page_connexion_accessible(self):
        response = self.client.get(reverse("login"))
        self.assertContains(response, "Se connecter")

    def test_connexion_valide_redirige_vers_accueil(self):
        response = self.client.post(
            reverse("login"), {"username": "moi", "password": "secret123"}
        )
        self.assertRedirects(response, reverse("core:home"))

    def test_connexion_invalide_affiche_erreur(self):
        response = self.client.post(
            reverse("login"), {"username": "moi", "password": "faux"}
        )
        self.assertContains(response, "incorrect")

    def test_deconnexion_par_post(self):
        self.client.login(username="moi", password="secret123")
        response = self.client.post(reverse("logout"))
        self.assertRedirects(response, reverse("login"))
        self.assertRedirects(
            self.client.get(reverse("core:home")), "/login/?next=/"
        )


class DashboardTests(TestCase):
    def setUp(self):
        get_user_model().objects.create_user("moi", password="x")
        self.client.login(username="moi", password="x")

    def test_accueil_sans_solde(self):
        response = self.client.get(reverse("core:home"))
        self.assertContains(response, "Aucun solde enregistré")
        self.assertContains(response, "Budgets")

    def test_accueil_affiche_dernier_solde(self):
        from django.utils import timezone

        from .models import SoldeOM

        SoldeOM.objects.create(datetime=timezone.now(), balance=12345)
        response = self.client.get(reverse("core:home"))
        self.assertContains(response, 'data-countup="12345"')

    def test_fragment_alertes_htmx(self):
        response = self.client.get(reverse("core:alertes"))
        self.assertContains(response, "Aucune alerte")
        self.assertNotContains(response, "<html")

    def test_alertes_protegees(self):
        self.client.logout()
        self.assertEqual(self.client.get(reverse("core:alertes")).status_code, 302)

    def test_ressources_statiques_locales(self):
        from django.contrib.staticfiles import finders

        for path in (
            "vendor/bootstrap.min.css", "vendor/htmx.min.js",
            "vendor/bootstrap-icons.min.css", "vendor/fonts/bootstrap-icons.woff2",
            "css/app.css", "js/app.js",
        ):
            self.assertIsNotNone(finders.find(path), path)


class SoldeViewsTests(TestCase):
    def setUp(self):
        get_user_model().objects.create_user("moi", password="x")
        self.client.login(username="moi", password="x")

    def test_saisie_solde(self):
        from .models import SoldeOM

        r = self.client.post(
            reverse("core:solde_create"), {"datetime": "2026-10-01T08:30", "balance": 250000}
        )
        self.assertRedirects(r, reverse("core:solde_list"))
        s = SoldeOM.objects.get()
        self.assertEqual(s.balance, 250000)
        from django.utils import timezone as tz

        self.assertEqual(tz.localtime(s.datetime).hour, 8)  # saisie en heure locale

    def test_solde_negatif_refuse(self):
        from .models import SoldeOM

        r = self.client.post(
            reverse("core:solde_create"), {"datetime": "2026-10-01T08:30", "balance": -1}
        )
        self.assertContains(r, "négatif")
        self.assertFalse(SoldeOM.objects.exists())

    def test_date_future_refusee(self):
        r = self.client.post(
            reverse("core:solde_create"), {"datetime": "2999-01-01T08:30", "balance": 1}
        )
        self.assertContains(r, "futur")

    def test_historique_et_suppression(self):
        from django.utils import timezone

        from .models import SoldeOM

        s = SoldeOM.objects.create(datetime=timezone.now(), balance=1234567)
        self.assertContains(self.client.get(reverse("core:solde_list")), "1 234 567 Ar")
        r = self.client.post(reverse("core:solde_delete", args=[s.pk]), HTTP_HX_REQUEST="true")
        self.assertEqual(r.status_code, 204)
        self.assertFalse(SoldeOM.objects.exists())

    def test_formulaire_prerempli_avec_maintenant(self):
        r = self.client.get(reverse("core:solde_create"))
        self.assertContains(r, 'type="datetime-local"')
        self.assertContains(r, "value=")

    def test_parametres_modifiables(self):
        from .models import ParametreJob

        r = self.client.post(reverse("core:parametres"), {"start_day_int": 12})
        self.assertRedirects(r, reverse("core:home"))
        self.assertEqual(ParametreJob.load().start_day_int, 12)

    def test_parametres_hors_bornes_refuses(self):
        from .models import ParametreJob

        self.client.post(reverse("core:parametres"), {"start_day_int": 31})
        self.assertEqual(ParametreJob.load().start_day_int, 20)

    def test_tuiles_actives_sur_accueil(self):
        r = self.client.get(reverse("core:home"))
        for name in ("budgets:list", "budgets:type_list", "core:solde_list", "core:parametres"):
            self.assertContains(r, f'href="{reverse(name)}"')
