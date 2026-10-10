import * as React from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AmountKeypad } from "@/components/AmountKeypad";
import { groupDigits } from "@/lib/calc";
import { SheetSelect, DateField } from "@/components/pickers";

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
  locale: string;
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
    locale,
  } = props;
  return (
    <div className="space-y-4">
      <div>
        <Label>Amount (IDR)</Label>
        <AmountField
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
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
        <SheetSelect
          label="Category"
          value={form.category_id}
          onPick={(v) => setForm({ ...form, category_id: v })}
          placeholder="None"
          options={[{ value: "", label: "None" }, ...(cats ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        />
        <DateField
          label="Date"
          value={form.entry_date}
          onChange={(iso) => setForm({ ...form, entry_date: iso })}
          locale={locale}
        />
      </div>
      {txType === "transfer" ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <SheetSelect
            label="From"
            value={form.account_id}
            onPick={(v) => setForm({ ...form, account_id: v })}
            placeholder="Select"
            options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
          <SheetSelect
            label="To"
            value={form.to_account_id}
            onPick={(v) => setForm({ ...form, to_account_id: v })}
            placeholder="Select"
            options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>
      ) : (
        <SheetSelect
          label="Ledger"
          value={form.account_id}
          onPick={(v) => setForm({ ...form, account_id: v })}
          placeholder="Select ledger"
          options={(accounts ?? []).map((a) => ({
            value: a.id,
            label: a.name,
            hint: formatMoney(balances.get(a.id)?.toNumber() ?? 0),
          }))}
        />
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

/** Amount entry through the in-app keypad — never the system keyboard. */
function AmountField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const shown = value === "" ? "0" : /^[0-9]+$/.test(value) ? groupDigits(value) : value;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 flex h-16 w-full items-center justify-between rounded-xl border border-input bg-background px-4 active:scale-[0.99] transition-transform"
      >
        <span className="font-display tnum text-3xl font-semibold truncate">
          {shown}
        </span>
        <span className="text-xs font-medium text-muted-foreground shrink-0 ml-2">IDR • tap</span>
      </button>
      <AmountKeypad
        open={open}
        digits={/^[0-9+\-]*$/.test(value) ? value : ""}
        onDigits={onChange}
        onClose={() => setOpen(false)}
        title="Amount"
      />
    </>
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
