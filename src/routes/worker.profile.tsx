import { createFileRoute } from "@tanstack/react-router";
import { Card, Initials } from "@/components/app/ui";
import { PasswordForm } from "@/components/app/PasswordForm";
import { useStore } from "@/lib/store";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/worker/profile")({
  head: () => meta("Profile", "Your live worker account and password settings."),
  component: Profile,
});

function Profile() {
  const { state, user } = useStore();
  const done = state.tasks.filter(
    (t) => t.workerId === user?.id && t.status === "completed",
  ).length;
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center p-6 text-center">
        <Initials name={user?.name ?? "?"} className="h-16 w-16 text-lg" />
        <p className="mt-3 text-lg font-semibold">{user?.name}</p>
        <p className="text-sm text-muted-foreground">
          @{user?.username}
          {user?.phone ? ` · ${user.phone}` : ""}
        </p>
        <p className="mt-3 text-sm">{done} tasks completed</p>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">Change password</h2>
        <PasswordForm />
      </Card>
    </div>
  );
}
