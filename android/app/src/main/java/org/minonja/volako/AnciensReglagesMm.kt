package org.minonja.volako // Dossier du code de l'application

import android.content.Context // Contexte de l'application
import androidx.work.WorkManager // Planificateur de tâches d'Android (sert ici à annuler l'ancienne tâche horaire)
import java.security.KeyStore // Coffre à clés d'Android

// Nettoyage des anciennes versions : le PIN Mobile Money n'est plus JAMAIS enregistré (il est demandé à chaque envoi).
// Au démarrage, on efface donc ce que les versions précédentes avaient pu garder : PIN chiffré, clé du coffre, tâche horaire, réponses en attente.
object AnciensReglagesMm { // Objet unique

    // Efface toute trace de l'ancien stockage du PIN et de l'ancienne consultation automatique.
    fun nettoyer(contexte: Context) { // Reçoit le contexte
        contexte.getSharedPreferences(SmsMmReceiver.PREFERENCES, Context.MODE_PRIVATE).edit() // Réglages natifs privés
            .remove("pin_chiffre") // Efface le PIN chiffré
            .remove("reponses_ussd") // Efface les réponses en attente de l'ancienne tâche
            .remove("consultation_auto") // Efface l'état de la consultation automatique
            .remove("consultation_arret") // Efface la raison d'arrêt
            .apply() // Enregistre
        try { // Les opérations suivantes ne doivent jamais empêcher l'application de démarrer
            val coffre = KeyStore.getInstance("AndroidKeyStore") // Ouvre le coffre Android
            coffre.load(null) // Charge son contenu
            if (coffre.containsAlias("volako_pin_om")) coffre.deleteEntry("volako_pin_om") // Détruit l'ancienne clé de chiffrement du PIN
            WorkManager.getInstance(contexte).cancelUniqueWork("consultation_solde_om") // Annule l'ancienne tâche horaire
        } catch (erreur: Exception) { /* sans importance : il ne reste alors qu'un texte chiffré déjà effacé ci-dessus */ } // Ignore
    } // Fin de nettoyer
} // Fin de l'objet
