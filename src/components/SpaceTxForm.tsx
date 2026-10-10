import * as React from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface TxFormState {
  title: string;
  body: string;
  amount: string;
  category_id: string;
  account_id: string;
  to_account_id: string;
  entry_date: string;
}

export type TxType = "expense" | "income" | "transfer";
export interface TxOption {
  id: string;
  name: string;
}
export interface TxTag {
  id: string;
  name: string;
}
export interface TxBalances {
  get(id: string): { toNumber(): number } | undefined;
}

type SetForm = React.Dispatch<React.SetStateAction<TxFormState>>;

export function TxTypeTabs({
  value,
  onPick,
}: {
  value: TxType;
  onPick: (t: TxType) => void;
}) {
  return (
    <div className="flex rounded-full bg-muted p-1">
      {(["expense", "income", "transfer"] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPick(k)}
          className={cn(
            "flex-1 rounded-full py-2.5 text-xs font-medium capitalize flex items-center justify-center gap-1.5 transition-all",
            value === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
          )}
        >
          {k === "expense" ? (
            <ArrowDownCircle className="h-4 w-4" />
          ) : k === "income" ? (
            <ArrowUpCircle className="h-4 w-4" />
          ) : (
            <ArrowLeftRight className="h-4 w-4" />
          )}
          {k}
        </button>
      ))}
    </div>
  );
}

/** Amount-first field order: the figure leads, details follow. */
export function TxFields(props: {
  form: TxFormState;
  setForm: SetForm;
  txType: TxType;
  cats: TxOption[] | null | undefined;
  accounts: TxOption[] | null | undefined;
  balances: TxBalances;
  tags: TxTag[] | null | undefined;
  selectedTagIds: string[];
  toggleTag: (id: string) => void;
  onManageTags: () => void;
}) {
  const {
    form,
    setForm,
    txType,
    cats,
    accounts,
    balances,
    tags,
    selectedTagIds,
    toggleTag,
    onManageTags,
  } = props;
  return (
    <div className="space-y-4">
      <div>
        <Label>Amount (IDR)</Label>
        <Input
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          inputMode="decimal"
          placeholder="50000"
          className="mt-1.5 h-16 font-display tnum text-3xl font-semibold"
        />
      </div>
      <div>
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Groceries, Salary"
          className="mt-1.5"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div>
          <Label>Category</Label>
          <Select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="mt-1.5"
          >
            <option value="">None</option>
            {cats?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={form.entry_date}
            onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
            className="mt-1.5"
          />
        </div>
      </div>
      {txType === "transfer" ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div>
            <Label>From</Label>
            <Select
              value={form.account_id}
              onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              className="mt-1.5"
            >
              <option value="">Select</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>To</Label>
            <Select
              value={form.to_account_id}
              onChange={(e) => setForm({ ...form, to_account_id: e.target.value })}
              className="mt-1.5"
            >
              <option value="">Select</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <div>
          <Label>Ledger</Label>
          <Select
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
            className="mt-1.5"
          >
            <option value="">Select ledger</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatMoney((balances.get(a.id)?.toNumber() ?? 0))}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label>Note</Label>
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="Optional note"
          rows={2}
          className="mt-1.5"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>Tags</Label>
          <button
            type="button"
            onClick={onManageTags}
            className="text-[10px] text-primary hover:underline"
          >
            Manage
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(tags ?? []).map((t) => {
            const sel = selectedTagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all",
                  sel
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground hover:border-primary/50"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", sel ? "bg-white" : "bg-muted-foreground/50")} />
                {t.name}
              </button>
            );
          })}
          {(tags ?? []).length === 0 && (
            <span className="text-[10px] text-muted-foreground">No tags — create in Manage</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TxFooter({
  editing,
  txType,
  saving,
  onCancel,
  onSave,
}: {
  editing: boolean;
  txType: TxType;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <Button variant="outline" onClick={onCancel} className="h-12 flex-1 sm:flex-none">
        Cancel
      </Button>
      <Button onClick={onSave} disabled={saving} className="h-12 flex-1 sm:flex-none text-base">
        {editing ? "Save" : "Add"} {txType}
      </Button>
    </>
  );
}
