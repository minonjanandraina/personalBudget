import { formaterMontant } from "../core/format.js"; // Reprend la fonction de formatage de la logique métier
import { lireVersion } from "../core/db/migrations.js"; // Lit la version de la base (pour le diagnostic)

// Dessine l'écran d'accueil dans l'élément reçu.
export async function afficherAccueil(conteneur, base) { // Reçoit la zone où dessiner et la base de données
  const soldes = await base.requeter("SELECT balance FROM solde_om ORDER BY datetime DESC, id DESC LIMIT 1"); // Lit le dernier solde enregistré
  const solde = soldes.length === 0 ? 0 : Number(soldes[0].balance); // Aucun solde = 0 Ar
  const version = await lireVersion(base); // Version actuelle de la base
  const types = await base.requeter("SELECT COUNT(*) AS n FROM type_budget"); // Compte les types de budget (preuve que la base répond)
  conteneur.innerHTML = ` 
    <h1>Volako</h1>
    <section class="carte">
      <p>Solde Orange Money</p>
      <strong>${formaterMontant(solde)}</strong>
    </section>
    <section class="carte diagnostic">
      <p>Diagnostic de la base</p>
      <ul>
        <li>Moteur : ${base.nom}</li>
        <li>Version du schéma : ${version}</li>
        <li>Liens entre tables contrôlés : ${base.cleEtrangeresActives ? "oui" : "NON"}</li>
        <li>Types de budget : ${Number(types[0].n)}</li>
      </ul>
    </section>
  `; // Remplace le contenu de la zone par le titre, le solde et le diagnostic
} // Fin de la fonction
