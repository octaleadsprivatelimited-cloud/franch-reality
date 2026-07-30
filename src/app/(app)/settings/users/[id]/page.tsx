import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getUserById } from "@/lib/queries/users";
import { getLocalitiesForUser } from "@/lib/queries/inventory";
import {
  UserForm,
  ResetPasswordForm,
  DeactivateButton,
  type UserFormValues,
} from "@/components/settings/UserForm";
import {
  updateUserAction,
  resetPasswordAction,
  deactivateUserAction,
} from "../../actions";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const user = await getUserById(id);
  if (!user) notFound();
  const localities = await getLocalitiesForUser(admin);

  const isSelf = id === admin.id;

  // Whether deactivating this user would remove the last active admin.
  const otherActiveAdmins =
    user.role === "ADMIN" && user.isActive
      ? await prisma.user.count({
          where: { role: "ADMIN", isActive: true, id: { not: id } },
        })
      : 1; // not an active admin → never the last one
  const isLastAdmin = otherActiveAdmins === 0;

  const initial: UserFormValues = {
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    cities: user.cities,
    isActive: user.isActive,
    areaIds: user.assignedAreas.map((a) => a.id),
  };

  const updateAction = updateUserAction.bind(null, id);
  const resetAction = resetPasswordAction.bind(null, id);
  const deactivateAction = deactivateUserAction.bind(null, id);

  const canDeactivate = user.isActive && !isSelf && !isLastAdmin;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="space-y-5">
      <Link
        href="/settings"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--ink-soft)",
        }}
      >
        ← Back to settings
      </Link>
      <div className="page-header">
        <div>
          <h1>Edit user</h1>
          <div className="subtitle">{user.email}</div>
        </div>
      </div>

      <UserForm
        action={updateAction}
        user={initial}
        localities={localities}
        isEdit
        submitLabel="Save changes"
      />

      <div className="card card-pad space-y-4">
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Reset password</h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
            Sets a new sign-in password for this user. They are not notified
            automatically.
          </p>
        </div>
        <ResetPasswordForm action={resetAction} />
      </div>

      {canDeactivate && (
        <div
          className="card card-pad space-y-3"
          style={{ borderColor: "#efc4c4" }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Deactivate account</h3>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
              The user can no longer sign in. Their history is preserved — accounts
              are never deleted.
            </p>
          </div>
          <DeactivateButton action={deactivateAction} />
        </div>
      )}
    </div>
  );
}
