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
