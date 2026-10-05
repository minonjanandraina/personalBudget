from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "trx_id", "allocation", "debit_credit", "montant", "insert_type", "insert_date",
    )
    list_filter = ("insert_type", "debit_credit")
    search_fields = ("trx_id", "sms")
