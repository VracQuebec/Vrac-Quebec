
UPDATE public.jsc_materials SET
 public_description = 'Mélange de pierre concassée et de fines de calibre 0 à 3/4 de pouce. Il se compacte fermement, ce qui en fait la base la plus utilisée sous les entrées, les dalles et les stationnements.',
 uses = ARRAY['Fondation d''entrée de cour et de stationnement','Base sous dalle de béton ou pavé-uni','Chemin d''accès de chantier','Correction de niveau compactable'],
 seo_text = 'La pierre concassée 0-3/4 (souvent appelée MG-20 lorsqu''elle répond à la norme) contient à la fois des granulats et des particules fines. Ces fines comblent les vides entre les pierres et permettent au matériau de se verrouiller au compactage, contrairement à une pierre nette. On la livre au camion en vrac; la quantité se calcule en tonnes à partir de la surface et de l''épaisseur voulue, généralement 100 à 150 mm pour une entrée résidentielle. Vrac Québec coordonne l''approvisionnement et la livraison auprès des carrières et transporteurs de la région.'
WHERE slug='pierre-concassee-0-3-4';

UPDATE public.jsc_materials SET
 public_description = 'Pierre concassée 3/4 de pouce lavée, sans particules fines. Elle ne se compacte pas et laisse l''eau circuler librement.',
 uses = ARRAY['Drain français et lit de drainage','Enrobage de tuyaux et de fosses','Lit de pose sous dalle avec membrane','Fond de tranchée'],
 seo_text = 'La pierre 3/4 net est tamisée et lavée : il ne reste que des granulats de calibre uniforme, sans poussière. C''est ce qui lui donne sa capacité de drainage, recherchée autour des drains français, des fondations et des tuyaux. Comme elle ne se verrouille pas au compactage, elle ne convient pas comme fondation portante sous une entrée : on lui préfère alors une pierre 0-3/4. Livraison en vrac au camion, calculée en tonnes selon le volume de la tranchée.'
WHERE slug='pierre-concassee-3-4-net';

UPDATE public.jsc_materials SET
 public_description = 'Résidu fin de concassage, aussi appelé criblure de pierre. Il se nivelle facilement et sert de lit de pose sous les pavés et les dalles.',
 uses = ARRAY['Lit de pose sous pavé-uni et dalles','Nivellement fin avant pose','Remplissage des joints de pavés','Sentier compacté'],
 seo_text = 'La poussière de pierre est le matériau fin issu du concassage de la roche. Étendue sur 25 à 40 mm au-dessus d''une fondation de pierre 0-3/4, elle permet d''ajuster les niveaux au millimètre avant la pose du pavé-uni. Elle se compacte bien mais draine peu : elle doit toujours reposer sur une fondation adéquate et non remplacer celle-ci. Elle se vend en vrac à la tonne et se livre au camion selon l''accès au chantier.'
WHERE slug='poussiere-de-pierre';

UPDATE public.jsc_materials SET
 public_description = 'Sable naturel tamisé, utilisé comme remblai léger, lit de pose ou matériau de nivellement autour des ouvrages enterrés.',
 uses = ARRAY['Remblai de tranchée et enrobage de conduites','Lit de pose de piscine','Nivellement de terrain','Aménagement d''aire de jeu'],
 seo_text = 'Le sable en vrac couvre plusieurs usages de chantier : enrobage de conduites, fond de piscine, nivellement ou remblai autour d''une fondation. Sa granulométrie fine évite d''endommager les tuyaux et facilite le nivellement à la règle. Le volume nécessaire se calcule à partir de la surface et de l''épaisseur; la conversion en tonnes dépend de la densité et de l''humidité du sable au moment du chargement. Vrac Québec organise l''achat et la livraison au chantier.'
WHERE slug='sable';

UPDATE public.jsc_materials SET
 public_description = 'Sable granulaire sélectionné pour sa capacité à se compacter, utilisé en remblai structural sous les dalles et les ouvrages.',
 uses = ARRAY['Remblai compacté sous dalle','Coussin sous fondation','Remblai de tranchée structurant','Rehaussement de terrain'],
 seo_text = 'Le sable à compaction, parfois appelé sable de remblai ou sable B, contient une proportion de particules fines qui lui permet d''atteindre une densité élevée lorsqu''il est mis en place par couches et compacté. On l''utilise là où le remblai doit reprendre une charge : sous une dalle, un garage ou une conduite. Il se livre en vrac à la tonne et sa mise en place se fait généralement par couches de 200 à 300 mm compactées successivement.'
WHERE slug='sable-a-compaction';

UPDATE public.jsc_materials SET
 public_description = 'Terre végétale tamisée, débarrassée des pierres et des racines, prête pour l''ensemencement, la tourbe et les plates-bandes.',
 uses = ARRAY['Aménagement de pelouse et ensemencement','Pose de tourbe','Plates-bandes et potager','Nivellement de terrain autour de la maison'],
 seo_text = 'La terre tamisée passe au crible pour retirer les roches, mottes et débris, ce qui donne un matériau homogène facile à étendre au râteau. Une épaisseur de 100 à 150 mm est généralement recommandée avant la pose de tourbe ou l''ensemencement. Elle se vend en vrac à la verge cube et se livre au camion; l''accès au terrain détermine le type de camion utilisé. Vrac Québec coordonne la livraison auprès des fournisseurs de la région de Québec et des environs.'
WHERE slug='terre-tamisee';
