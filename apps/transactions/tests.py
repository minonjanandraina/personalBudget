from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.budgets.models import AllocationBudget, Budget, TypeBudget

from .models import Transaction


class TransactionTests(TestCase):
    def setUp(self):
        t = TypeBudget.objects.create(name="Loisir")
        b = Budget.objects.create(
            name="Sorties", type=t, montant_budget=1000, montant_max=2000
        )
        self.alloc = AllocationBudget.objects.create(
            budget=b, date_from=date(2026, 10, 1),
            date_to=date(2026, 10, 31), montant_alloue=1000,
        )

    def test_trx_id_genere_pour_saisie_manuelle(self):
        t = Transaction.objects.create(allocation=self.alloc, debit_credit=-1, montant=500)
        self.assertTrue(t.trx_id.startswith("MAN-"))
        self.assertEqual(t.insert_type, "manuel")
        self.assertIsNone(t.sms)

    def test_trx_id_unique(self):
        Transaction.objects.create(trx_id="X1", debit_credit=-1, montant=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Transaction.objects.create(trx_id="X1", debit_credit=-1, montant=1)

    def test_montant_signe(self):
        d = Transaction.objects.create(debit_credit=-1, montant=500)
        c = Transaction.objects.create(debit_credit=1, montant=500)
        self.assertEqual((d.montant_signe, c.montant_signe), (-500, 500))

    def test_debit_credit_invalide_refuse(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Transaction.objects.create(debit_credit=0, montant=1)

    def test_montant_nul_refuse(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Transaction.objects.create(debit_credit=1, montant=0)

    def test_transaction_non_classee_possible(self):
        t = Transaction.objects.create(
            debit_credit=-1, montant=10, insert_type="auto", sms="texte"
        )
        self.assertIsNone(t.allocation)
