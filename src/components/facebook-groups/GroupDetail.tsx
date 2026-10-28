import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Search, Copy, Send, CheckCircle2, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import PublicationFiles from "./PublicationFiles";
import {
  fetchGroupEvents,
  fetchPublications,
  logEvent,
  markPublished,
  markSubmitted,
  mergeGroup,
  updateGroup,
  upsertPublication,
} from "@/lib/facebook-groups/api";
import {
  GROUP_STATUS_LABEL,
  PUBLICATION_STATUS_LABEL,
  type FbGroup,
  type FbGroupEvent,
  type FbPublication,
  type FbPublicationStatus,
} from "@/lib/facebook-groups/types";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function GroupDetail(props: {
  group: FbGroup;
  actor: string;
  allGroups: FbGroup[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [g, setG] = useState<FbGroup>(props.group);
  const [pubs, setPubs] = useState<FbPublication[]>([]);
  const [events, setEvents] = useState<FbGroupEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [realDate, setRealDate] = useState(todayIso());
  const [postUrl, setPostUrl] = useState("");
  const [content, setContent] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const saveDraft = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const id = await upsertPublication({ ...(draftId ? { id: draftId } : {}), group_id: g.id, content_text: content || null, status: "a_preparer" }, props.actor);
      setDraftId(id);
      await load();
    } catch { toast({ title: "Brouillon non enregistré", description: "Réessayez avant d’ajouter les pièces.", variant: "destructive" }); }
    finally { setActionBusy(false); }
  };

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      fetchPublications({ groupId: props.group.id }),
      fetchGroupEvents(props.group.id),
    ]);
    setPubs(p);
    setEvents(e);
  }, [props.group.id]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const save = async (patch: Partial<FbGroup>) => {
    setSaving(true);
    try {
      await updateGroup(g.id, patch, props.actor);
      setG({ ...g, ...patch });
      props.onChanged();
      toast({ title: "Fiche enregistrée" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const lastAttempt = pubs.find((p) => ["soumis", "publie", "refuse", "retire"].includes(p.status));
  const lastPublished = pubs.find((p) => p.status === "publie");

  // Ouvrir le groupe ou copier le texte ne marque jamais rien comme envoyé ou publié.
  const openGroup = () => {
    if (g.fb_url) window.open(g.fb_url, "_blank", "noopener");
  };
  const searchOnFacebook = () => {
    window.open(
      `https://www.facebook.com/search/groups/?q=${encodeURIComponent(g.name)}`,
      "_blank",
      "noopener",
    );
  };
  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Texte copié" });
  };

  const doSubmit = async () => {
    try {
      await markSubmitted({ ...(draftId ? { id: draftId } : {}), group_id: g.id, content_text: content || null }, realDate, props.actor);
      setDraftId(null);
      toast({ title: "Tentative enregistrée", description: "Soumission notée — pas encore une publication." });
      load();
    } catch (e) {
      toast({ title: "Action impossible", description: String(e), variant: "destructive" });
    }
  };

  const doPublish = async () => {
    try {
      await markPublished(
        { ...(draftId ? { id: draftId } : {}), group_id: g.id, content_text: content || null },
        realDate,
        postUrl || null,
        props.actor,
      );
      toast({ title: "Publication confirmée" });
      setDraftId(null);
      load();
    } catch (e) {
      toast({ title: "Action impossible", description: String(e), variant: "destructive" });
    }
  };

  const setStatus = async (pub: FbPublication, status: FbPublicationStatus) => {
    try {
      await upsertPublication({ id: pub.id, group_id: g.id, status }, props.actor);
      load();
    } catch (e) {
      toast({ title: "Action impossible", description: String(e), variant: "destructive" });
    }
  };

  const doMerge = async () => {
    if (!mergeTarget) return;
    try {
      await mergeGroup(g.id, mergeTarget, props.actor);
      toast({ title: "Fusion enregistrée", description: "Historique et références conservés." });
      props.onChanged();
      props.onClose();
    } catch (e) {
      toast({ title: "Fusion impossible", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{g.source_id ?? "manuel"}</span>
            <span className="min-w-0 break-words">{g.name}</span>
            {g.name_incomplete && <Badge variant="destructive">Nom à compléter</Badge>}
          </DialogTitle>
        </DialogHeader>

        {g.transcription_note && (
          <p className="text-sm text-muted-foreground">Note de transcription : {g.transcription_note}</p>
        )}
        {g.captures.length > 0 && (
          <p className="text-xs text-muted-foreground">Captures sources : {g.captures.join(", ")}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Lien Facebook (vide tant que non vérifié)</Label>
            <div className="flex gap-1">
              <Input
                value={g.fb_url ?? ""}
                placeholder="https://www.facebook.com/groups/…"
                onChange={(e) => setG({ ...g, fb_url: e.target.value })}
              />
              <Button size="sm" variant="outline" disabled={saving} onClick={() => save({ fb_url: g.fb_url })}>
                OK
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Identifiant Facebook (si disponible)</Label>
            <Input
              value={g.fb_identifier ?? ""}
              onChange={(e) => setG({ ...g, fb_identifier: e.target.value })}
              onBlur={() => save({ fb_identifier: g.fb_identifier })}
            />
          </div>
          <div className="space-y-1">
            <Label>Région (suggestion modifiable)</Label>
            <Input value={g.region ?? ""} onChange={(e) => setG({ ...g, region: e.target.value })} onBlur={() => save({ region: g.region })} />
          </div>
          <div className="space-y-1">
            <Label>Villes</Label>
            <Input value={g.cities ?? ""} onChange={(e) => setG({ ...g, cities: e.target.value })} onBlur={() => save({ cities: g.cities })} />
          </div>
          <div className="space-y-1">
            <Label>Catégorie (suggestion modifiable)</Label>
            <Input value={g.category ?? ""} onChange={(e) => setG({ ...g, category: e.target.value })} onBlur={() => save({ category: g.category })} />
          </div>
          <div className="space-y-1">
            <Label>Langue</Label>
            <Input value={g.language ?? ""} onChange={(e) => setG({ ...g, language: e.target.value })} onBlur={() => save({ language: g.language })} />
          </div>
          <div className="space-y-1">
            <Label>Règles de publicité</Label>
            <Select value={g.ad_rules} onValueChange={(v) => save({ ad_rules: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_verifier">À vérifier</SelectItem>
                <SelectItem value="autorisee">Publicité autorisée</SelectItem>
                <SelectItem value="interdite">Publicité interdite</SelectItem>
                <SelectItem value="jours_precis">Jours précis seulement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Jours autorisés</Label>
            <Input value={g.allowed_days ?? ""} placeholder="ex. lundi, jeudi" onChange={(e) => setG({ ...g, allowed_days: e.target.value })} onBlur={() => save({ allowed_days: g.allowed_days })} />
          </div>
          <div className="space-y-1">
            <Label>Intervalle minimal (jours) — prévaut sur la campagne</Label>
            <Input
              type="number"
              value={g.min_interval_days ?? ""}
              onChange={(e) => setG({ ...g, min_interval_days: e.target.value ? Number(e.target.value) : null })}
              onBlur={() => save({ min_interval_days: g.min_interval_days })}
            />
          </div>
          <div className="space-y-1">
            <Label>Compte/page membre</Label>
            <Input value={g.member_account ?? ""} onChange={(e) => setG({ ...g, member_account: e.target.value })} onBlur={() => save({ member_account: g.member_account })} />
          </div>
          <div className="space-y-1">
            <Label>État</Label>
            <Select value={g.status} onValueChange={(v) => save({ status: v as FbGroup["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GROUP_STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Notes internes</Label>
            <Textarea value={g.internal_notes ?? ""} onChange={(e) => setG({ ...g, internal_notes: e.target.value })} onBlur={() => save({ internal_notes: g.internal_notes })} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={openGroup} disabled={!g.fb_url}>
            <ExternalLink className="h-4 w-4 mr-1" /> Ouvrir le groupe
          </Button>
          <Button size="sm" variant="secondary" onClick={searchOnFacebook}>
            <Search className="h-4 w-4 mr-1" /> Rechercher ce nom sur Facebook
          </Button>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <h3 className="font-medium text-sm">Nouvelle tentative / publication</h3>
          <Textarea
            placeholder="Texte ou référence du contenu publié…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button size="sm" variant="outline" disabled={actionBusy} onClick={saveDraft}>Enregistrer le brouillon</Button>
          {draftId && <PublicationFiles key={draftId} publicationId={draftId} />}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date réelle de l'action</Label>
              <Input type="date" value={realDate} onChange={(e) => setRealDate(e.target.value)} />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs">Lien du post Facebook (si publié)</Label>
              <Input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={() => content && copyText(content)} disabled={!content}>
              <Copy className="h-4 w-4 mr-1" /> Copier le texte
            </Button>
            <Button size="sm" variant="secondary" onClick={doSubmit}>
              <Send className="h-4 w-4 mr-1" /> Marquer soumis
            </Button>
            <Button size="sm" onClick={doPublish}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmer publié
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            « Marquer soumis » enregistre une tentative. « Confirmer publié » enregistre une publication
            effective avec sa date réelle. Ouvrir ou copier ne marque jamais rien.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">Journal des publications</h3>
          <p className="text-xs text-muted-foreground">
            Dernière tentative : {lastAttempt ? `${PUBLICATION_STATUS_LABEL[lastAttempt.status]} le ${(lastAttempt.submitted_real_date ?? lastAttempt.published_real_date ?? lastAttempt.updated_at).slice(0, 10)}` : "jamais"}
            {" — "}Dernière publication confirmée : {lastPublished ? (lastPublished.published_real_date ?? lastPublished.published_at ?? "").slice(0, 10) : "jamais"}
          </p>
          {pubs.filter((p) => p.id !== draftId).map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
              <Badge>{PUBLICATION_STATUS_LABEL[p.status]}</Badge>
              <span className="text-xs text-muted-foreground">
                action {(p.submitted_at ?? p.published_at ?? p.created_at).slice(0, 10)}
                {p.published_real_date && ` — post réel du ${p.published_real_date}`}
              </span>
              {p.post_url && (
                <a className="text-xs underline" href={p.post_url} target="_blank" rel="noreferrer">
                  post Facebook
                </a>
              )}
              <div className="ml-auto flex gap-1">
                {p.status === "soumis" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus(p, "refuse")}>Refusé</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(p, "retire")}>Retiré</Button>
                  </>
                )}
                {(p.status === "refuse" || p.status === "retire") && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(p, "planifie")}>Replanifier</Button>
                )}
              </div>
              <PublicationFiles publicationId={p.id} />
            </div>
          ))}
          {pubs.length === 0 && <p className="text-sm text-muted-foreground">Aucune publication enregistrée.</p>}
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm flex items-center gap-1"><HistoryIcon className="h-4 w-4" /> Historique des modifications</h3>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {events.map((e) => (
              <p key={e.id} className="text-xs text-muted-foreground">
                {e.created_at.slice(0, 16).replace("T", " ")} — {e.action}
                {e.detail ? ` — ${JSON.stringify(e.detail)}` : ""}
              </p>
            ))}
            {events.length === 0 && <p className="text-xs text-muted-foreground">Aucun événement.</p>}
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <h3 className="font-medium text-sm">Fusion manuelle (préserve tout l'historique)</h3>
          <div className="flex gap-2">
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Fusionner dans…" /></SelectTrigger>
              <SelectContent>
                {props.allGroups
                  .filter((x) => x.id !== g.id && !x.merged_into)
                  .slice(0, 200)
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.source_id ?? ""} {x.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={doMerge} disabled={!mergeTarget}>Fusionner</Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => save({ archived_at: g.archived_at ? null : new Date().toISOString() })}
          >
            {g.archived_at ? "Restaurer" : "Archiver (sans perte d'historique)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
