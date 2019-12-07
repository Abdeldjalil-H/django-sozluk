from django.contrib import admin, messages as notifications
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.decorators import permission_required
from django.core.mail import send_mail
from django.db.models import Q, Case, When, IntegerField
from django.shortcuts import get_object_or_404, redirect, reverse
from django.utils.decorators import method_decorator
from django.views.generic import ListView


from ...models import Author, Entry, Message
from ...utils import log_admin
from ...utils.settings import time_threshold_24h, application_decline_message, application_accept_message, \
    GENERIC_SUPERUSER_ID


def novice_list(limit=None):
    novice_queryset = Author.objects.filter(last_activity__isnull=False, is_novice=True,
                                            application_status="PN").annotate(
        activity=Case(When(Q(last_activity__gte=time_threshold_24h), then=2),
                      When(Q(last_activity__lte=time_threshold_24h), then=1), output_field=IntegerField(), )).order_by(
        "-activity", "application_date")

    if limit is not None:
        return novice_queryset[:limit]
    return novice_queryset


class NoviceList(LoginRequiredMixin, ListView):
    # View to list top 10 novices.
    model = Author
    template_name = "dictionary/admin/novices.html"

    @method_decorator(permission_required("dictionary.can_activate_user"))
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)

    def get_queryset(self):
        return novice_list(10)

    def get_context_data(self, *args, **kwargs):
        context = super().get_context_data(*args, **kwargs)
        context.update(admin.site.each_context(self.request))
        context["title"] = "Çaylak onay listesi"
        context["novice_count"] = novice_list().count()
        return context


class NoviceLookup(LoginRequiredMixin, ListView):
    """
    View to accept or reject a novice application. Lists first 10 entries of the novice user. Users will get mail
    and a message indicating the result of their application. A LogEntry object is created for this action.
    """

    model = Entry
    template_name = "dictionary/admin/novice_lookup.html"
    context_object_name = "entries"

    novice = None

    @method_decorator(permission_required("dictionary.can_activate_user"))
    def dispatch(self, request, *args, **kwargs):
        self.novice = get_object_or_404(Author, username=self.kwargs.get("username"))
        novices = novice_list()

        if self.novice not in novices:
            notifications.error(self.request, "kullanıcı çaylak onay listesinde değil.")
            self.novice = None
        elif self.novice not in novices[:10]:
            self.novice = None
            notifications.error(self.request, "kullanıcı çaylak onay listesinin başında değil")

        if self.novice is None:
            return redirect(reverse("admin:novice_list"))

        return super().dispatch(request, *args, **kwargs)

    def get_queryset(self):
        first_ten_entries = Entry.objects_published.filter(author=self.novice).order_by("id")[:10]
        return first_ten_entries

    def get_context_data(self, *args, **kwargs):
        context = super().get_context_data(*args, **kwargs)
        context.update(admin.site.each_context(self.request))
        context["title"] = f"{self.novice.username} isimli çaylağın ilk 10 entry'si"
        context["next"] = self.get_next_username()
        return context

    def post(self, *args, **kwargs):
        operation = self.request.POST.get("operation")

        if operation not in ["accept", "decline"]:
            notifications.error(self.request, "Geçersiz bir işlem seçtiniz.")
            return redirect(reverse("admin:novice_lookup", kwargs={"username": self.novice.username}))

        if operation == "accept":
            self.accept_application()
        elif operation == "decline":
            self.decline_application()

        if self.request.POST.get("submit_type") == "redirect_back":
            return redirect(reverse("admin:novice_list"))

        return redirect(reverse("admin:novice_lookup", kwargs={"username": self.request.POST.get("submit_type")}))

    def get_next_username(self):
        next_novice = None
        # Get next novice on the list and return it's username, required for 'save and continue'
        if self.novice.last_activity >= time_threshold_24h:
            next_novice = Author.objects.filter(is_novice=True, application_status="PN",
                                                last_activity__gt=time_threshold_24h,
                                                application_date__gt=self.novice.application_date).order_by(
                "application_date").first()

        if not next_novice:
            # There was no user with latest activity. Check for non-active ones.
            next_novice = Author.objects.filter(is_novice=True, application_status="PN",
                                                last_activity__lt=time_threshold_24h,
                                                application_date__gt=self.novice.application_date).order_by(
                "application_date").first()

        next_username = next_novice.username if next_novice else None
        return next_username

    def accept_application(self):
        user = self.novice
        user.application_status = "AP"
        user.is_novice = False
        user.save()
        admin_info_msg = f"{user.username} nickli kullanıcının yazarlık talebi kabul edildi"
        log_admin(admin_info_msg, self.request.user, Author, user)
        Message.objects.compose(Author.objects.get(id=GENERIC_SUPERUSER_ID), user,
                                application_accept_message.format(user.username))
        send_mail('yazarlık başvurunuz kabul edildi', application_accept_message.format(user.username),
                  'Django Sözlük <correct@email.com>', [user.email], fail_silently=False, )
        notifications.success(self.request, admin_info_msg)
        return True

    def decline_application(self):
        user = self.novice
        Entry.objects_published.filter(author=user).delete()  # does not trigger model's delete()
        user.application_status = "OH"
        user.application_date = None
        user.save()
        admin_info_msg = f"{user.username} nickli kullanıcının yazarlık talebi kabul reddedildi"
        log_admin(admin_info_msg, self.request.user, Author, user)
        Message.objects.compose(Author.objects.get(id=GENERIC_SUPERUSER_ID), user,
                                application_decline_message.format(user.username))
        send_mail('yazarlık başvurunuz reddedildi', application_decline_message.format(user.username),
                  'Django Sözlük <correct@email.com>', [user.email], fail_silently=False, )
        notifications.success(self.request, admin_info_msg)
        return True
