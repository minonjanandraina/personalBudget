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
