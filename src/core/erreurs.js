// Deux sortes d'erreurs « normales » de l'application (différentes d'un vrai bogue) :
// - ErreurValidation : une saisie est incorrecte ; on sait quels champs sont en cause.
// - ErreurMetier : une règle de gestion refuse l'opération (ex. suppression d'un élément utilisé).

// Erreur de saisie : « erreurs » associe le nom d'un champ à son message, ex. { nom: "Le nom est obligatoire" }.
export class ErreurValidation extends Error { // Hérite d'Error pour se comporter comme une erreur normale
  constructor(erreurs) { // Reçoit le dictionnaire champ -> message
    super(Object.values(erreurs).join(" ")); // Le message global regroupe tous les messages
    this.name = "ErreurValidation"; // Nom de l'erreur (utile pour la reconnaître)
    this.erreurs = erreurs; // Garde le détail par champ pour l'afficher sous chaque champ
  } // Fin du constructeur
} // Fin de ErreurValidation

// Erreur de règle de gestion : un seul message, destiné à être montré tel quel à l'utilisateur.
export class ErreurMetier extends Error { // Hérite d'Error
  constructor(message) { // Reçoit le message
    super(message); // Le message est transmis à Error
    this.name = "ErreurMetier"; // Nom de l'erreur
  } // Fin du constructeur
} // Fin de ErreurMetier
