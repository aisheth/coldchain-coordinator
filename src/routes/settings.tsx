import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { Card, PageHeader } from "@/components/app/ui";
import { PasswordForm } from "@/components/app/PasswordForm";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { errorMessage } from "@/lib/api";
import { meta } from "@/lib/seo";

export const Route = createFileRoute("/settings")({
  head: () => meta("Settings", "Live organization, approval and account settings."),
  component: Settings,
});

function Settings() {
  const { user, orgSettings, updateOrgSettings } = useStore();
  const [approval, setApproval] = useState(orgSettings?.require_owner_approval ?? false);
  const [photo, setPhoto] = useState(orgSettings?.require_delivery_photo ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await updateOrgSettings({ require_owner_approval: approval, require_delivery_photo: photo });
      toast.success("Organization settings saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="Settings" subtitle="Live account and organization settings." />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Organization</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {orgSettings?.organization_name ?? user?.org_id}
          </p>
          <label className="mt-5 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={approval}
              onChange={(e) => setApproval(e.target.checked)}
            />
            <span>
              <span className="font-medium">Require owner approval</span>
              <span className="block text-xs text-muted-foreground">
                Completed work must be confirmed by the owner.
              </span>
            </span>
          </label>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-primary"
              checked={photo}
              onChange={(e) => setPhoto(e.target.checked)}
            />
            <span>
              <span className="font-medium">Require delivery photo</span>
              <span className="block text-xs text-muted-foreground">
                Workers must attach proof when recording delivery.
              </span>
            </span>
          </label>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Button className="mt-5" onClick={() => void save()} disabled={busy || !orgSettings}>
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Save organization settings
          </Button>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.name} · {user?.username}
          </p>
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}
