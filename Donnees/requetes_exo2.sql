-- Question 2.1
-- les ouvrages sortis en 2021 ;
select ido, titre
from ouvrage
where extract(year from date_sortie) = 2021 ;

-- il existait d'autres façons de faire,
-- comme contraindre sate_sortie à être entre le 1er janvier et le 31 décembre 2021
select ido, titre
from ouvrage
where date_sortie between to_date('01/01/2021','DD/MM/YYYY') and to_date('31/12/2021','DD/MM/YYYY') ;

-- les ouvrages dessinés par Christophe Blain ;
select ido, titre
from ouvrage o
join personne p on o.dessinateur = p.idp
where nom='Blain' and prenom = 'Christophe' ;

-- les ouvrages dessinés par Christophe Blain et scénarisés par Joann Sfar ;
select ido, titre
from ouvrage o
join personne p1 on o.dessinateur = p1.idp
join personne p2 on o.scenariste = p2.idp
where p1.nom='Blain' and p1.prenom = 'Christophe'
and p2.nom='Sfar' and p2.prenom = 'Joann';

-- avec des sous-requêtes :
select ido, titre
from ouvrage o
where o.dessinateur = (select idp from personne where nom='Blain' and prenom = 'Christophe' )
and o.scenariste = (select idp from personne where nom='Sfar' and prenom = 'Joann');

-- les ouvrages dessinés et scénarisés par Christophe Blain ;
select ido, titre
from ouvrage o
join personne p on o.dessinateur = p.idp
where nom='Blain' and prenom = 'Christophe' and o.dessinateur = o.scenariste ;

-- les concepts avec leur concept père s'il existe
select c1.idc, c1.label, c2.idc as idc_pere, c2.label as label_pere
from concept c1
left join concept c2 on c1.concept_pere = c2.idc ;
-- voir plus loin pour les requêtes hiérarchiques et récursives (pas demandé)


-- le nombre de dessinateurs (i.e. le nombre de personnes qui ont dessiné au moins un ouvrage)
-- on a besoin de la table Ouvrage pour vérifier que la personne a le role de dessinateur.
-- Beaucoup d'entre vous ont utilisé la table Personne :
select count(distinct idp) as nb_dessinateurs
from personne p
join ouvrage o on p.idp = o.dessinateur ;

select count(*) as nb_dessinateurs
from personne p
where p.idp in (select dessinateur from ouvrage);

-- il y a une solution plus simple parce qu'elle évite une jointure inutile :
select count(distinct dessinateur) from ouvrage;

-- la liste des ouvrages, avec éventuellement le titre de la série dont ils font partie
select ouvrage.ido, ouvrage.titre, serie.titre as titre_serie, ouvrage.num_ordre
from ouvrage
left join serie using(ids)
order by ido;

select ouvrage.ido, serie.titre ||' '|| ouvrage.titre
from ouvrage
left join serie using(ids)
order by ido;

-- la liste des ouvrages avec le nombre de mots clés qui leurs sont directement attachés (0 s'il n'y a pas de mot clé)
select o.ido, o.titre, (select count(*) from a_pour_mot_cle where ido=o.ido) as nb_mots_cles
from ouvrage o ;

select o.ido, o.titre, count(idc) as nb_mots_cles
from ouvrage o
left join a_pour_mot_cle a on o.ido = a.ido
group by o.ido, o.titre ;

-- Question 2.2
-- requete 1
-- le nombre d'avis, le plus petit score, le plus grand score
-- et le score moyen de chaque ouvrage.
select ido, titre, count(*) as nb_avis,
min(score) as score_min, max(score) as score_max, round(avg(score),2) as score_moy
from ouvrage
join avis using (ido)
group by ido, titre;

-- si on veut les ouvrages qui n'ont pas d'avis :
select ido, titre, count(avis.SCORE) as nb_avis,
min(score) as score_min, max(score) as score_max, round(avg(score),2) as score_moy
from ouvrage
left join avis using (ido)
group by ido, titre;

-- requete 2
-- l'ouvrage (ou les ouvrages en cas d'ex aequo)
-- avec la meilleur moyenne des scores.
select ido, titre
from ouvrage
join avis using (ido)
group by ido, titre
having avg(score) =  (
  select max(avg(score))
  from avis
  group by ido); --> remarque : on n'a pas besoin de Ouvrage pour la sous requête

-- avec une relation intermédiaire req_stat, c'est plus simple
with req_stat as(
    select ido, titre, avg(score) as score_moy
    from ouvrage
    join avis using (ido)
    group by ido, titre
)
select ido, titre
from req_stat
where score_moy = (select max(score_moy) from req_stat);

-- requete 3
-- par dessinateur, l'ouvrage (ou les ouvrages en cas d'ex aequo)
-- avec la meilleure moyenne des scores.
select ido, o1.titre, p.nom, p.prenom
from ouvrage o1
join avis using (ido)
join personne p on p.idp = o1.dessinateur
group by ido, o1.titre, p.nom, p.prenom, o1.dessinateur -- on doit grouper par dessinateur pour pouvoir l'utiliser dans la sous-requete
having avg(score) =  (
  select max(avg(score))
  from ouvrage o2
  join avis using (ido)
  where o1.dessinateur = o2.dessinateur
  group by ido, o2.titre); -- ici on a besoin d'ouvrage à cause du dessinateur qui est fixé (ss-requete correlative)

-- avec une relation intermédiaire req_stat
with req_stat as(
    select ido, titre, nom, prenom, dessinateur, avg(score) as score_moy
    from ouvrage
    join avis using (ido)
    join personne p on p.idp = dessinateur
    group by ido, titre, nom, prenom, dessinateur
)
select ido, titre, nom, prenom
from req_stat r1
where score_moy = (select max(score_moy)
                   from req_stat r2
                   where r2.dessinateur = r1.dessinateur);

-- requete 4
-- un "histogramme" des avis, i.e. le nombre d'avis à 0, le nombre d'avis à 1, etc.
select sum(case score when 0 then 1 else 0 end) as nb_0,
  sum(case score when 1 then 1 else 0 end) as nb_1,
  sum(case score when 2 then 1 else 0 end) as nb_2,
  sum(case score when 3 then 1 else 0 end) as nb_3,
  sum(case score when 4 then 1 else 0 end) as nb_4,
  sum(case score when 5 then 1 else 0 end) as nb_5
from avis ;

      NB_0       NB_1       NB_2       NB_3       NB_4       NB_5
---------- ---------- ---------- ---------- ---------- ----------
         2          3          5          6         10         10

-- ou avec sous-requetes (moins efficace)
select (select count(*) from avis where score=0) as nb_0,
(select count(*) from avis where score=1) as nb_1,
(select count(*) from avis where score=2) as nb_2,
(select count(*) from avis where score=3) as nb_3,
(select count(*) from avis where score=4) as nb_4,
(select count(*) from avis where score=5) as nb_5
from dual ;

-- requete 5
-- les pseudos des gens qui n'ont mis que des scores entre 0 et 2.
select pseudo
from avis
group by pseudo
having max(score) <= 2;

-----------------------------------------------------
-- pas demandé - requêtes récursives

--1- requetes hiérarchiques, syntaxe propre à oracle
-- voir https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Hierarchical-Queries.html#GUID-0118DF1D-B9A9-41EB-8556-C6E7D6A5A84E

select idc, label, concept_pere, level
from concept
connect by prior idc = concept_pere;

-- c'est fouilli parce qu'il calcule les ancêtres de chaque ligne
-- donc on a des répétitions

-- c'est plus clair quand on choisit la racine, on a 1 seule hiérarchie
select idc, label, concept_pere, level
from concept
start with idc=1
connect by prior idc = concept_pere;
/*
       IDC LABEL                CONCEPT_PERE      LEVEL
---------- -------------------- ------------ ----------
         1 histoire                                   1
        12 antiquité                       1          2
        13 moyen âge                       1          2
        14 époque moderne                  1          2
*/

-- ou quand on commence par les concepts sans pere :
select idc, label, concept_pere, level
from concept
start with concept_pere is null
connect by prior idc = concept_pere;
/*
       IDC LABEL                CONCEPT_PERE      LEVEL
---------- -------------------- ------------ ----------
         1 histoire                                   1
        12 antiquité                       1          2
        13 moyen âge                       1          2
        14 époque moderne                  1          2
         2 féminisme                                  1
         3 animal                                     1
         4 chien                           3          2
         5 chat                            3          2
         6 biographie                                 1
         7 science fiction                            1
         8 philosophie                                1
         9 Afrique                                    1
        10 Côte d'Ivoire                   9          2
        11 heroïc fantasy                             1
        15 Amérique                                   1
        16 religion                                   1
        17 mythologie                     16          2
        18 mythologie grecque             17          3
        19 policier                                   1

19 lignes sélectionnées.
*/
-- on recherche les BD qui ont un animal comme mot clé.
-- Il faut donc rechercher toute la hiérarchie de racine 'animal'
select *
from ouvrage
join a_pour_mot_cle a using (ido)
where idc in (select idc
from concept
start with label='animal'
connect by prior idc = concept_pere
);

--2- Dans la norme SQL il existe des requêtes récursives,
-- on utilise le With pour cela

-- Avec Oracle ça donne :
With concept_animal(idc,label,concept_pere) as( -- on est obligé de nommer les colonnes
  select idc,label,concept_pere from concept
  where label = 'animal'
  union all
  select c.idc,c.label,c.concept_pere
    from concept_animal ca --> recursivité
    join concept c on c.concept_pere = ca.idc
)
select idc,label,concept_pere from concept_animal ;
/*
       IDC LABEL                CONCEPT_PERE
---------- -------------------- ------------
         3 animal
         4 chien                           3
         5 chat                            3
*/

-- Voir https://modern-sql.com/caniuse/with_recursive_(top_level)
-- concernant la conformité à la norme.

