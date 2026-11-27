"""The procurement status lifecycle: one table, easy to read and test."""

# from_status -> {to_status: roles allowed to make the move}
TRANSITIONS: dict[str, dict[str, set[str]]] = {
    "assigned": {"accepted": {"worker"}},
    "accepted": {
        "travelling": {"worker"},
        "reached_vendor": {"worker"},
        "availability_confirmed": {"worker"},  # the two travel steps are optional
    },
    "travelling": {"reached_vendor": {"worker"}},
    "reached_vendor": {"availability_confirmed": {"worker"}},
    "availability_confirmed": {"procurement_in_progress": {"worker"}},
    "procurement_in_progress": {"dispatched": {"worker"}, "pending_approval": {"worker"}},
    "pending_approval": {"dispatched": {"owner"}},  # owner approval
    "dispatched": {"delivered": {"worker"}},
    "delivered": {"completed": {"owner"}, "dispatched": {"owner"}},  # second one = reject delivery
}

TERMINAL = {"completed", "cancelled"}
CANCELLABLE = set(TRANSITIONS) - {"delivered"}  # cancel is owner-only, any time before delivery

# Moves that need extra data and therefore have their own endpoint.
DEDICATED_ENDPOINT = {
    "delivered": "POST /assignments/{id}/delivery",
    "completed": "POST /assignments/{id}/confirm-completion",
}

# Worker moves that notify the owner (travelling / reached_vendor are history-only, to avoid noise).
NOTIFY_OWNER = {"accepted", "availability_confirmed", "pending_approval", "dispatched", "delivered"}

LABELS = {
    "assigned": "Assigned", "accepted": "Accepted", "travelling": "Travelling to vendor",
    "reached_vendor": "Reached vendor", "availability_confirmed": "Availability confirmed",
    "procurement_in_progress": "Procurement in progress", "pending_approval": "Awaiting approval",
    "dispatched": "Dispatched", "delivered": "Delivered", "completed": "Completed", "cancelled": "Cancelled",
}
