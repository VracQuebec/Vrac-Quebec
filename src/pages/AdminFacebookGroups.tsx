import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Facebook } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FullPageState from "@/components/FullPageState";
import TransportBanner from "@/components/TransportBanner";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import DirectoryTab from "@/components/facebook-groups/DirectoryTab";
import GroupDetail from "@/components/facebook-groups/GroupDetail";
import NextGroupsTab from "@/components/facebook-groups/NextGroupsTab";
import PublicationsTab from "@/components/facebook-groups/PublicationsTab";
import CampaignsTab from "@/components/facebook-groups/CampaignsTab";
import { fetchAllGroups } from "@/lib/facebook-groups/api";
import type { FbGroup } from "@/lib/facebook-groups/types";

export default function AdminFacebookGroups() {
  const navigate = useNavigate();
  const { user, isReady: authReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const [selected, setSelected] = useState<FbGroup | null>(null);
  const [allGroups, setAllGroups] = useState<FbGroup[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) fetchAllGroups().then(setAllGroups).catch(() => undefined);
  }, [isAdmin, reloadKey]);

  if (!authReady || roleLoading) return <FullPageState message="Chargement…" />;
  if (!user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />
      <main className="mx-auto max-w-6xl p-4 space-y-4">
        <header className="flex items-center gap-2">
          <Facebook className="h-6 w-6" />
          <div>
            <h1 className="text-xl font-semibold">Groupes Facebook</h1>
            <p className="text-sm text-muted-foreground">
              Répertoire provisoire issu du relevé de captures — les liens et identités Facebook restent à
              vérifier. Suivi manuel des publications, sans envoi automatique.
            </p>
          </div>
        </header>

        <Tabs defaultValue="repertoire">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="repertoire">Répertoire</TabsTrigger>
            <TabsTrigger value="prochains">Prochains groupes</TabsTrigger>
            <TabsTrigger value="publications">Publications</TabsTrigger>
            <TabsTrigger value="campagnes">Campagnes</TabsTrigger>
          </TabsList>
          <TabsContent value="repertoire">
            <DirectoryTab actor={user.id} onOpenGroup={setSelected} reloadKey={reloadKey} />
          </TabsContent>
          <TabsContent value="prochains">
            <NextGroupsTab actor={user.id} onOpenGroup={setSelected} />
          </TabsContent>
          <TabsContent value="publications">
            <PublicationsTab />
          </TabsContent>
          <TabsContent value="campagnes">
            <CampaignsTab actor={user.id} />
          </TabsContent>
        </Tabs>

        {selected && (
          <GroupDetail
            group={selected}
            actor={user.id}
            allGroups={allGroups}
            onClose={() => setSelected(null)}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        )}
      </main>
    </div>
  );
}
