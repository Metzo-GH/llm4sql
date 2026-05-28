/*
drop table personne cascade constraints ;
drop table serie cascade constraints ;
drop table ouvrage cascade constraints ;
drop table concept cascade constraints ;
drop table a_pour_mot_cle cascade constraints ;
drop table avis cascade constraints ;
purge recyclebin ;
*/
create table Personne(
    idp Number(3) constraint personne_pkey primary key,
    nom Varchar2(30) not null,
    prenom Varchar2(30),
    date_naiss DATE,
    date_deces DATE
);

insert into Personne(idp, nom, prenom, date_naiss)
values(1, 'Blain', 'Christophe', to_date('10/08/1970','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(2, 'Sfar', 'Joann', to_date('28/08/1971','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(3, 'Trondheim', 'Lewis', to_date('11/12/1964','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(4, 'Catel', null, to_date('27/08/1964','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(5, 'Bocquet', 'José-Louis', to_date('28/08/1962','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(6, 'Walter', null, to_date('06/02/1969','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(7, 'Arleston', 'Christophe', to_date('14/08/1963','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(8, 'Mourier', 'Jean-Louis', to_date('06/11/1962','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(9, 'Guth', 'Claude', to_date('01/03/1962','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(10, 'Diaz Canales', 'Juan', to_date('01/01/1972','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(11, 'Guarnido', 'Juanjo', to_date('01/01/1967','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(12, 'Ayroles', 'Alain', to_date('01/01/1968','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(13, 'Oubrerie', 'Clément', to_date('23/12/1966','DD/MM/YYYY'));

insert into Personne(idp, nom, prenom, date_naiss)
values(14, 'Abouet', 'Marguerite', to_date('01/01/1971','DD/MM/YYYY'));

------------------------------------------------------------------------
create table Serie(
    ids Number(3) constraint serie_pkey primary key,
    titre Varchar2(100) not null
);

insert into serie(ids, titre) values(1, 'Socrate le demi-chien');

insert into serie(ids,titre) values (2,'donjon');

insert into serie(ids,titre) values (3,'Trolls de Troy');

insert into serie(ids,titre) values (4,'Blacksad');

insert into serie(ids,titre) values (5,'Aya de Yopougon');
------------------------------------------------------------------------
create table Ouvrage(
    ido Number(5) constraint ouvrage_pkey primary key,
    titre Varchar2(100) not null,
    dessinateur Number(3) not null constraint ouvrage_dessinateur_fkey references Personne,
    scenariste Number(3) not null constraint ouvrage_scenariste_fkey references Personne,
    coloriste constraint ouvrage_coloriste_fkey references Personne,
    ids constraint ouvrage_serie_fkey references Serie,
    num_ordre Number(2),
    date_sortie DATE
);

-- tome 1 de Socrate le demi-chien, Blain-Sfar
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie, ids, num_ordre)
values(11, 'Héraclès', 1,2, to_date('19/01/2002','DD/MM/YYYY'),1,1);
-- tome 2 de Socrate le demi-chien, Blain-Sfar
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie, ids, num_ordre)
values(12, 'Ulysse', 1,2, to_date('20/11/2004','DD/MM/YYYY'),1,2);

-- Biographie Alice Guy, Catel-Bocquet
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie)
values(13, 'Alice Guy, le destin romanesque d''une femme hors normes', 4, 5, to_date('22/09/2021','DD/MM/YYYY'));

-- Biographie Olympe de Gouges
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie)
values(14, 'Olympe de Gouges', 4, 5, to_date('14/03/2012','DD/MM/YYYY'));

-- tome 84 donjon, Blain-Sfar-Walter
insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(15, 'Après la pluie', 1,2,6, to_date('06/12/2006','DD/MM/YYYY'),2,84);

-- tomes 23 et 24, Trolls de Troy, Mourier-Arleston 
insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(16, 'Art brut', 8,7,null, to_date('10/10/2018','DD/MM/YYYY'),3,23);

insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(17, 'Un caillou sur la tête', 8,7,9, to_date('04/12/2019','DD/MM/YYYY'),3,24);

-- BD Blain
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie)
values(18, 'Carnet d''un matelot', 1,1, to_date('01/04/1994','DD/MM/YYYY'));

-- Blacksad tome 3, Guarnido-Diaz Canales
insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(19, 'Ame rouge', 11,10,null, to_date('18/11/2005','DD/MM/YYYY'),4,3);

insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(20, 'L''enfer, le silence', 11,10,null, to_date('17/09/2010','DD/MM/YYYY'),4,4);

-- Trondheim
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie)
values(21, 'Imbroglio', 3,3, to_date('01/04/1994','DD/MM/YYYY'));

insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie)
values(26, 'ALIEEN', 3,3, to_date('25/01/2007','DD/MM/YYYY'));

-- donjon Trondhein-Sfar
insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(23, 'Coeur de Canard', 3,2,6, to_date('01/04/1998','DD/MM/YYYY'),2,1);

-- BD historique - Guarnido-Ayroles
insert into ouvrage(ido,titre,dessinateur, scenariste,date_sortie)
values(22, 'Les Indes Fourbes', 11, 12, to_date('28/08/2019','DD/MM/YYYY'));

-- Aya
insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(24, 'Volume 1', 13,14,null, to_date('20/11/2005','DD/MM/YYYY'),5,1);

insert into ouvrage(ido,titre,dessinateur, scenariste, coloriste, date_sortie, ids, num_ordre)
values(25, 'Volume 2', 13,14,null, to_date('29/09/2006','DD/MM/YYYY'),5,2);

------------------------------------------------------------------------
create table Concept(
  idc Number(3) constraint concept_pkey primary key,
  label Varchar2(20),
  concept_pere Number(3) constraint concept_pere_fkey references Concept
);

insert into concept(idc,label,concept_pere) values(1,'histoire',null);
insert into concept(idc,label,concept_pere) values(12,'antiquité',1);
insert into concept(idc,label,concept_pere) values(13,'moyen âge',1);
insert into concept(idc,label,concept_pere) values(14,'époque moderne',1);
insert into concept(idc,label,concept_pere) values(3,'animal',null);
insert into concept(idc,label,concept_pere) values(4,'chien',3);
insert into concept(idc,label,concept_pere) values(5,'chat',3);
insert into concept(idc,label,concept_pere) values(6,'biographie',null);
insert into concept(idc,label,concept_pere) values(7,'science fiction',null);
insert into concept(idc,label,concept_pere) values(8,'philosophie',null);
insert into concept(idc,label,concept_pere) values(9,'Afrique',null);
insert into concept(idc,label,concept_pere) values(10,'Côte d''Ivoire',9);
insert into concept(idc,label,concept_pere) values(2,'féminisme',null);
insert into concept(idc,label,concept_pere) values(11,'heroïc fantasy',null);
insert into concept(idc,label,concept_pere) values(15,'Amérique',null);
insert into concept(idc,label,concept_pere) values(16,'religion',null);
insert into concept(idc,label,concept_pere) values(17,'mythologie',16);
insert into concept(idc,label,concept_pere) values(18,'mythologie grecque',17);
insert into concept(idc,label,concept_pere) values(19,'policier',null);

------------------------------------------------------------------------
create table a_pour_mot_cle(
    ido constraint apmc_ouvrage references Ouvrage,
    idc constraint apmc_concept references Concept,
    constraint apmc_pkey primary key(ido,idc)
);

insert into a_pour_mot_cle(ido,idc) values(11,8);
insert into a_pour_mot_cle(ido,idc) values(11,12);
insert into a_pour_mot_cle(ido,idc) values(11,4);
insert into a_pour_mot_cle(ido,idc) values(11,17);
insert into a_pour_mot_cle(ido,idc) values(12,8);
insert into a_pour_mot_cle(ido,idc) values(12,12);
insert into a_pour_mot_cle(ido,idc) values(12,4);
insert into a_pour_mot_cle(ido,idc) values(12,17);
insert into a_pour_mot_cle(ido,idc) values(13,2);
insert into a_pour_mot_cle(ido,idc) values(13,6);
insert into a_pour_mot_cle(ido,idc) values(14,2);
insert into a_pour_mot_cle(ido,idc) values(14,6);
insert into a_pour_mot_cle(ido,idc) values(14,14);
insert into a_pour_mot_cle(ido,idc) values(15,11);
insert into a_pour_mot_cle(ido,idc) values(15,3);
insert into a_pour_mot_cle(ido,idc) values(16,11);
insert into a_pour_mot_cle(ido,idc) values(17,11);
-- pas de mot clé pour l'ouvrage 18
insert into a_pour_mot_cle(ido,idc) values(19,19);
insert into a_pour_mot_cle(ido,idc) values(19,5);
insert into a_pour_mot_cle(ido,idc) values(20,19);
insert into a_pour_mot_cle(ido,idc) values(20,5);
-- pas de mot clé pour imbroglio 21
insert into a_pour_mot_cle(ido,idc) values(22,14);
insert into a_pour_mot_cle(ido,idc) values(22,15);
insert into a_pour_mot_cle(ido,idc) values(23,11);
insert into a_pour_mot_cle(ido,idc) values(23,3);
insert into a_pour_mot_cle(ido,idc) values(24,2);
insert into a_pour_mot_cle(ido,idc) values(24,10);
insert into a_pour_mot_cle(ido,idc) values(25,2);
insert into a_pour_mot_cle(ido,idc) values(25,10);
insert into a_pour_mot_cle(ido,idc) values(26,7);

---------------------------------------------------------
-- Les avis - pour l'exercice 2 question 2
create table Avis(
    pseudo varchar2(10),
    ido constraint avis_ouvrage references ouvrage,
    constraint avis_pkey primary key (pseudo, ido),
    score Number(1),
    constraint score_enum check (score between 0 and 5)
) ;

-- l'ouvrage 18 n'a pas d'avis
insert into avis(pseudo, ido, score) values('mikasa',11, 3);
insert into avis(pseudo, ido, score) values('mikasa',16, 2);
insert into avis(pseudo, ido, score) values('mikasa',24, 5);
insert into avis(pseudo, ido, score) values('mikasa',25, 5);
insert into avis(pseudo, ido, score) values('mikasa',14, 4);
insert into avis(pseudo, ido, score) values('mikasa',22, 3);
insert into avis(pseudo, ido, score) values('mikasa',19, 1);

insert into avis(pseudo, ido, score) values('erik',15, 2);
insert into avis(pseudo, ido, score) values('erik',23, 2);
insert into avis(pseudo, ido, score) values('erik',21, 1);
insert into avis(pseudo, ido, score) values('erik',22, 0);
insert into avis(pseudo, ido, score) values('erik',11, 2);
insert into avis(pseudo, ido, score) values('erik',12, 0);

insert into avis(pseudo, ido, score) values('theboss',11, 3);
insert into avis(pseudo, ido, score) values('theboss',13, 4);
insert into avis(pseudo, ido, score) values('theboss',14, 5);
insert into avis(pseudo, ido, score) values('theboss',15, 5);
insert into avis(pseudo, ido, score) values('theboss',17, 3);
insert into avis(pseudo, ido, score) values('theboss',20, 5);
insert into avis(pseudo, ido, score) values('theboss',22, 5);
insert into avis(pseudo, ido, score) values('theboss',23, 4);

insert into avis(pseudo, ido, score) values('moussa',11, 4);
insert into avis(pseudo, ido, score) values('moussa',12, 4);

insert into avis(pseudo, ido, score) values('sylvester',14, 3);
insert into avis(pseudo, ido, score) values('sylvester',15, 5);

insert into avis(pseudo, ido, score) values('kate',13, 1);

insert into avis(pseudo, ido, score) values('charly',25, 4);
insert into avis(pseudo, ido, score) values('charly',17, 5);

insert into avis(pseudo, ido, score) values('loulou',23, 4);

insert into avis(pseudo, ido, score) values('naruto',19, 2);

insert into avis(pseudo, ido, score) values('angela',20, 4);
insert into avis(pseudo, ido, score) values('angela',21, 5);
insert into avis(pseudo, ido, score) values('angela',22, 4);

insert into avis(pseudo, ido, score) values('iza',24, 5);

insert into avis(pseudo, ido, score) values('tonio',25, 3);
insert into avis(pseudo, ido, score) values('tonio',26, 4);

commit;


