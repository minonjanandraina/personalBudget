// SMS Orange Money d'exemple, utilisés dans le navigateur à la place de la boîte de réception du téléphone.
// Ce sont de vrais SMS (identifiants conservés) : 5 opérations comprises et 1 SMS volontairement non compris.

// Renvoie la liste [{ corps, date }] ; les dates sont « maintenant moins quelques secondes » pour être postérieures au solde initial saisi.
export function SMS_EXEMPLES(maintenant) { // Reçoit l'heure de référence
  const corps = [ // Textes des SMS, du plus ancien au plus récent
    "Votre transfert de 12000.0Ar vers  le numero client PAMF 5969657 est reussi. Motif: Transfert. Frais: 400.0Ar. Nouveau solde Orange Money : 931616.0Ar. Trans Id: MP261005.1023.C25734 Orange Money vous remercie.", // Transfert avec frais
    "Virement programme de 500 Ar de votre compte Orange Money vers compte epargne reussi. Ref: CO261001.0800.A06136.\nNouveau solde epargne : 509.08 Ar.", // Virement épargne (pas de solde OM)
    "Felicitations, votre compte Orange Money a ete debite de 54500 Ar pour rembourser entierement votre pret. Nouveau solde Orange Money : 5916.47 Ar. Trans ID : CO261005.0817.B53793. PAMF et Orange Money vous remercient de votre fidelite au service m-kajy", // Remboursement de prêt (solde avec centimes)
    "Le retrait de 60000 Ar sur votre compte aupres du 0327573815 est reussi. Frais : 1900 Ar. Nouveau solde : 944016 Ar. Trans Id : CO261005.1019.A72879 . Orange Money vous remercie", // Retrait avec frais
    "Le remboursement a ete effectue avec succes et le montant total du de votre pret va etre mis a jour en maximum 3 heures. Votre compte Orange Money a ete debite de 500 Ar. Reste a payer : 1089500 Ar. Nouveau solde Orange Money : 931116.47 Ar. Trans ID : CO261005.1641.B33339. PAMF et Orange Money vous remercient.", // Remboursement partiel
    "Promo Orange Money : profitez de 20% de bonus sur vos achats de credit.", // SMS qui n'est pas une opération (non compris)
  ]; // Fin des textes
  return corps.map((texte, i) => ({ corps: texte, date: new Date(maintenant.getTime() - (corps.length - i) * 1000).toISOString() })); // Une seconde d'écart entre deux SMS
} // Fin de SMS_EXEMPLES
