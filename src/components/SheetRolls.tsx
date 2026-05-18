import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dices, Swords } from "lucide-react";

export const STATUS_CONDITIONS = [
  "Burn", "Poison", "Paralyzed", "Frozen Solid", "Sleep",
  "Confused", "Disabled", "Flinched", "In Love",
] as const;

export function painPenaltyFor(current: number, max: number): number {
  if (max <= 0) return 0;
  if (current <= 1) return 2;
  if (current * 2 <= max) return 1;
  return 0;
}

export function HpAndStatusBlock({
  current, max, status, painPenalty, canEdit,
  onHpChange, onStatusChange,
}: {
  current: number;
  max: number;
  status: string[];
  painPenalty: number;
  canEdit: boolean;
  onHpChange: (n: number) => void;
  onStatusChange: (next: string[]) => void;
}) {
  function toggle(name: string, on: boolean) {
    const set = new Set(status);
    if (on) set.add(name); else set.delete(name);
    onStatusChange(Array.from(set));
  }
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Current HP</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={max}
              value={current}
              disabled={!canEdit}
              onChange={(e) => {
                const n = Math.max(0, Math.min(max, parseInt(e.target.value) || 0));
                onHpChange(n);
              }}
              className="h-8 w-20"
            />
            <span className="text-xs text-muted-foreground">/ {max}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
            painPenalty === 0 ? "bg-muted text-muted-foreground"
              : painPenalty === 1 ? "bg-amber-500/20 text-amber-600"
                : "bg-destructive/20 text-destructive"
          }`}>
            Pain Penalty −{painPenalty}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Subtracts {painPenalty} success{painPenalty === 1 ? "" : "es"} from every roll.
          </span>
        </div>
      </div>
      <div>
        <Label className="text-xs">Status problems</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {STATUS_CONDITIONS.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              <Checkbox
                checked={status.includes(c)}
                disabled={!canEdit}
                onCheckedChange={(v) => toggle(c, !!v)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AttackRollButton({
  characterName, attrLabel, attrValue, skillOptions, painPenalty, onRoll,
}: {
  characterName: string;
  attrLabel: string;
  attrValue: number;
  skillOptions: { name: string; value: number }[];
  painPenalty: number;
  onRoll: (label: string, n: number, penalty?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState(skillOptions[0]?.name ?? "");
  const [bonus, setBonus] = useState(0);
  const chosen = skillOptions.find((s) => s.name === skill) ?? skillOptions[0];
  const pool = Math.max(0, attrValue + (chosen?.value ?? 0) + bonus);
  function fire() {
    onRoll(
      `${characterName} · Attack (${chosen?.name} + ${attrLabel})${bonus ? ` +${bonus}` : ""}`,
      pool,
      painPenalty,
    );
    setOpen(false);
    setBonus(0);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">
          <Swords className="mr-1 h-3.5 w-3.5" /> Attack
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Attack roll</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Skill</Label>
            <Select value={skill} onValueChange={setSkill}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {skillOptions.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} ({s.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Bonus dice</Label>
            <Input type="number" value={bonus} onChange={(e) => setBonus(parseInt(e.target.value) || 0)} className="h-8 w-24" />
          </div>
          <p className="text-xs text-muted-foreground">
            {attrLabel} {attrValue} + {chosen?.name ?? "—"} {chosen?.value ?? 0}
            {bonus ? ` + ${bonus}` : ""} = <b>{pool}d6</b>
            {painPenalty > 0 && <span className="text-destructive"> · −{painPenalty} success</span>}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={fire} disabled={pool <= 0}>
            <Dices className="mr-1.5 h-4 w-4" /> Roll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GenericRollButton({
  characterName, attrs, skills, painPenalty, onRoll,
}: {
  characterName: string;
  attrs: { name: string; value: number }[];
  skills: { name: string; value: number }[];
  painPenalty: number;
  onRoll: (label: string, n: number, penalty?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [attr, setAttr] = useState(attrs[0]?.name ?? "");
  const [skill, setSkill] = useState<string>("__none__");
  const [bonus, setBonus] = useState(0);
  const a = attrs.find((x) => x.name === attr);
  const s = skills.find((x) => x.name === skill);
  const pool = Math.max(0, (a?.value ?? 0) + (s?.value ?? 0) + bonus);
  function fire() {
    const label = `${characterName} · ${a?.name ?? "?"}${s ? ` + ${s.name}` : ""}${bonus ? ` +${bonus}` : ""}`;
    onRoll(label, pool, painPenalty);
    setOpen(false);
    setBonus(0);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">
          <Dices className="mr-1 h-3.5 w-3.5" /> Roll
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Generic roll</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Attribute</Label>
            <Select value={attr} onValueChange={setAttr}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {attrs.map((x) => (
                  <SelectItem key={x.name} value={x.name}>{x.name} ({x.value})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Skill (optional)</Label>
            <Select value={skill} onValueChange={setSkill}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— none —</SelectItem>
                {skills.map((x) => (
                  <SelectItem key={x.name} value={x.name}>{x.name} ({x.value})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Modifier</Label>
            <Input type="number" value={bonus} onChange={(e) => setBonus(parseInt(e.target.value) || 0)} className="h-8 w-24" />
          </div>
          <p className="text-xs text-muted-foreground">
            Pool = <b>{pool}d6</b>
            {painPenalty > 0 && <span className="text-destructive"> · −{painPenalty} success</span>}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={fire} disabled={pool <= 0}>
            <Dices className="mr-1.5 h-4 w-4" /> Roll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
