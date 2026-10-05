from datetime import date

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from .models import AllocationBudget, Budget, TypeBudget


def make_budget(**kw):
    t = TypeBudget.objects.create(name="Loisir")
    params = dict(name="Sorties", type=t, montant_budget=100000, montant_max=150000)
    params.update(kw)
    return Budget.objects.create(**params)


class TypeBudgetTests(TestCase):
    def test_code_auto_genere(self):
        a = TypeBudget.objects.create(name="A")
        b = TypeBudget.objects.create(name="B")
        self.assertEqual((a.code, b.code), ("bdg-001", "bdg-002"))

    def test_code_pas_reutilise_apres_suppression(self):
        TypeBudget.objects.create(name="A")
        b = TypeBudget.objects.create(name="B")
        TypeBudget.objects.get(code="bdg-001").delete()
        self.assertEqual(TypeBudget.objects.create(name="C").code, "bdg-003")
        self.assertEqual(b.code, "bdg-002")


class BudgetTests(TestCase):
    def test_min_superieur_au_max_refuse(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_budget(montant_min=200000)

    def test_type_protege_contre_suppression(self):
        b = make_budget()
        with self.assertRaises(ProtectedError):
            b.type.delete()


class AllocationTests(TestCase):
    def test_dates_incoherentes_refusees(self):
        b = make_budget()
        with self.assertRaises(IntegrityError), transaction.atomic():
            AllocationBudget.objects.create(
                budget=b, date_from=date(2026, 10, 20),
                date_to=date(2026, 10, 1), montant_alloue=1,
            )

    def test_une_allocation_par_periode(self):
        b = make_budget()
        kw = dict(
            budget=b, date_from=date(2026, 10, 1),
            date_to=date(2026, 10, 31), montant_alloue=1,
        )
        AllocationBudget.objects.create(**kw)
        with self.assertRaises(IntegrityError), transaction.atomic():
            AllocationBudget.objects.create(**kw)
