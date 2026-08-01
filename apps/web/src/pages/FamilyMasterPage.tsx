import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, X, UsersRound } from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { ClientPicker } from "../components/ui/ClientPicker";
import { MultiClientPicker } from "../components/ui/MultiClientPicker";
import {
  useAddFamilyMember,
  useCreateFamily,
  useFamilies,
  useRemoveFamily,
  useRemoveFamilyMember,
  useSetFamilyHead,
  useUpdateFamily,
  type Family,
} from "../hooks/useCrm";

function FamilyCard({ family }: { family: Family }) {
  const [addingMember, setAddingMember] = useState(false);
  const [memberId, setMemberId] = useState<string | undefined>();
  const [memberName, setMemberName] = useState<string | undefined>();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(family.familyName);
  const addMember = useAddFamilyMember();
  const setHead = useSetFamilyHead();
  const removeMember = useRemoveFamilyMember();
  const updateFamily = useUpdateFamily();
  const removeFamily = useRemoveFamily();

  return (
    <Card
      title={
        editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-series-1"
              autoFocus
            />
            <button
              onClick={async () => {
                if (!nameDraft.trim()) return;
                await updateFamily.mutateAsync({ familyId: family.id, familyName: nameDraft.trim() });
                setEditingName(false);
              }}
              className="rounded-md bg-series-1 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Save
            </button>
            <button onClick={() => { setEditingName(false); setNameDraft(family.familyName); }} className="text-xs text-ink-secondary hover:underline">
              Cancel
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-2">
            {family.familyName}
            <button onClick={() => setEditingName(true)} className="text-ink-muted hover:text-ink" aria-label="Edit family name">
              <Pencil size={12} />
            </button>
          </span>
        )
      }
      action={
        <button
          onClick={() => {
            if (window.confirm(`Remove the "${family.familyName}" family? Members stay as regular clients, they're just ungrouped.`)) {
              removeFamily.mutate(family.id);
            }
          }}
          className="flex items-center gap-1 text-xs text-status-critical hover:underline"
        >
          <Trash2 size={12} />
          Remove Family
        </button>
      }
    >
      <ul className="mb-3 divide-y divide-[var(--gridline)]">
        {family.members.length === 0 && <li className="py-2 text-sm text-ink-muted">No members yet.</li>}
        {family.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2 text-sm">
            <Link to={`/crm/${m.id}`} className="text-series-1 hover:underline">
              {m.name}
            </Link>
            <div className="flex items-center gap-3">
              {family.headClientId === m.id ? (
                <span className="rounded-full bg-series-1/10 px-2 py-0.5 text-xs text-series-1">Family Head</span>
              ) : (
                <button
                  onClick={() => setHead.mutate({ familyId: family.id, clientId: m.id })}
                  className="text-xs text-ink-secondary hover:underline"
                >
                  Make head
                </button>
              )}
              <button
                onClick={() => removeMember.mutate(m.id)}
                className="text-xs text-status-critical hover:underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {addingMember ? (
        <div className="flex items-center gap-2">
          <ClientPicker selectedClientId={memberId} selectedClientName={memberName} onSelect={(id, name) => { setMemberId(id); setMemberName(name); }} />
          <button
            disabled={!memberId}
            onClick={async () => {
              if (!memberId) return;
              await addMember.mutateAsync({ familyId: family.id, clientId: memberId });
              setMemberId(undefined);
              setMemberName(undefined);
              setAddingMember(false);
            }}
            className="rounded-md bg-series-1 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
          <button onClick={() => setAddingMember(false)} className="text-xs text-ink-secondary hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingMember(true)}
          className="flex items-center gap-1.5 text-xs text-ink-secondary hover:underline"
        >
          <Plus size={12} />
          Add member
        </button>
      )}
    </Card>
  );
}

function CreateFamilyPanel() {
  const [headId, setHeadId] = useState<string | undefined>();
  const [headName, setHeadName] = useState<string | undefined>();
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [familyName, setFamilyName] = useState("");
  const createFamily = useCreateFamily();

  function selectHead(id: string | undefined, name: string | undefined) {
    setHeadId(id);
    setHeadName(name);
    if (id && name && !familyName) {
      setFamilyName(`${name.split(" ")[0]} Family`);
    }
    // The head can't also be picked as a plain member.
    if (id) setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function reset() {
    setHeadId(undefined);
    setHeadName(undefined);
    setMembers([]);
    setFamilyName("");
  }

  async function handleCreate() {
    if (!headId || !familyName.trim()) return;
    await createFamily.mutateAsync({
      familyName: familyName.trim(),
      headClientId: headId,
      memberClientIds: members.map((m) => m.id),
    });
    reset();
  }

  return (
    <Card title="Create Family">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-secondary">
            Step 1 — Select the Family Head
          </label>
          <p className="mb-1.5 text-xs text-ink-muted">
            The head gets full visibility of every other member's holdings from their own client-portal login.
          </p>
          <ClientPicker selectedClientId={headId} selectedClientName={headName} onSelect={selectHead} />
        </div>

        {headId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">
              Step 2 — Select Family Members (searchable, {headName} excluded)
            </label>
            <MultiClientPicker selected={members} onChange={setMembers} excludeIds={[headId]} />
          </div>
        )}

        {headId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-secondary">Family Name</label>
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="e.g. Agrawal Family"
              className="w-64 rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-series-1"
            />
          </div>
        )}

        {headId && (
          <div className="flex items-center gap-2">
            <button
              disabled={!familyName.trim() || createFamily.isPending}
              onClick={handleCreate}
              className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {createFamily.isPending ? "Creating…" : "Create Family"}
            </button>
            <button onClick={reset} className="flex items-center gap-1 text-xs text-ink-secondary hover:underline">
              <X size={12} />
              Start Over
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function FamilyMasterPage() {
  const { data: families, isLoading } = useFamilies();

  return (
    <div className="space-y-4">
      <PageHeader icon={UsersRound} accent="series-5" title="Family Master">
        <p className="text-sm text-ink-secondary">
          Group related clients into a family and pick one member as the family head. The head gets full visibility
          of every member's holdings from their own client-portal login — every other member only ever sees their
          own.
        </p>
      </PageHeader>

      <CreateFamilyPanel />

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {families?.length === 0 && <p className="text-sm text-ink-muted">No families created yet.</p>}
      {families?.map((f) => <FamilyCard key={f.id} family={f} />)}
    </div>
  );
}
