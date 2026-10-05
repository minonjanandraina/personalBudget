from django.contrib import admin

from .models import ParametreJob, SoldeOM


@admin.register(SoldeOM)
class SoldeOMAdmin(admin.ModelAdmin):
    list_display = ("datetime", "balance", "insert_date")


@admin.register(ParametreJob)
class ParametreJobAdmin(admin.ModelAdmin):
    list_display = ("__str__", "start_day_int")

    def has_add_permission(self, request):
        return not ParametreJob.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
