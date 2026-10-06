package org.minonja.volako // Dossier du code de l'application

import android.content.Context // Contexte de l'application
import androidx.work.ExistingPeriodicWorkPolicy // Que faire si la tâche existe déjà
import androidx.work.PeriodicWorkRequest // Tâche répétée
import androidx.work.WorkManager // Planificateur de tâches d'Android
import androidx.work.Worker // Tâche exécutée en arrière-plan
import androidx.work.WorkerParameters // Paramètres de la tâche
import org.json.JSONArray // Liste JSON
import org.json.JSONObject // Objet JSON
import java.util.concurrent.CountDownLatch // Attente de la réponse USSD
import java.util.concurrent.TimeUnit // Unités de temps

// Tâche d'arrière-plan : toutes les heures, interroge le solde Orange Money par USSD.
// Elle n'écrit RIEN dans la base : la réponse brute est mise en attente (réglages natifs) et l'application l'enregistre
// comme SoldeOM à sa prochaine ouverture (le parsing et la base restent en JavaScript, testés sous Windows).
// SÉCURITÉ : si la réponse n'est pas un solde (ex. « PIN incorrect »), la consultation automatique S'ARRÊTE aussitôt,
// pour ne jamais répéter un PIN faux toutes les heures (risque de blocage du compte Orange Money).
class ConsultationWorker(contexte: Context, parametres: WorkerParameters) : Worker(contexte, parametres) { // Début de la classe

    companion object { // Valeurs communes
        const val NOM_TACHE = "consultation_solde_om" // Nom unique de la tâche planifiée
        const val CLE_ATTENTE = "reponses_ussd" // Clé de la liste des réponses en attente
        const val CLE_ACTIF = "consultation_auto" // Clé : consultation automatique active ou non
        const val CLE_ARRET = "consultation_arret" // Clé : raison de l'arrêt automatique (à montrer à l'utilisateur)

        private fun reglages(contexte: Context) = contexte.getSharedPreferences(SmsOmReceiver.PREFERENCES, Context.MODE_PRIVATE) // Réglages natifs privés

        // Planifie la consultation toutes les heures (le minimum d'Android est 15 minutes).
        fun activer(contexte: Context) { // Reçoit le contexte
            val demande = PeriodicWorkRequest.Builder(ConsultationWorker::class.java, 1, TimeUnit.HOURS).build() // Tâche répétée toutes les heures
            WorkManager.getInstance(contexte).enqueueUniquePeriodicWork(NOM_TACHE, ExistingPeriodicWorkPolicy.UPDATE, demande) // La planifie (remplace une éventuelle ancienne)
            reglages(contexte).edit().putBoolean(CLE_ACTIF, true).remove(CLE_ARRET).apply() // Note qu'elle est active
        } // Fin de activer

        // Arrête la consultation automatique ; « raison » (facultative) sera montrée à l'utilisateur.
        fun arreter(contexte: Context, raison: String? = null) { // Reçoit le contexte et la raison
            WorkManager.getInstance(contexte).cancelUniqueWork(NOM_TACHE) // Annule la tâche planifiée
            val editeur = reglages(contexte).edit().putBoolean(CLE_ACTIF, false) // Note qu'elle est inactive
            if (raison != null) editeur.putString(CLE_ARRET, raison) // Garde la raison
            editeur.apply() // Enregistre
        } // Fin de arreter

        // Vrai si la consultation automatique est active.
        fun actif(contexte: Context): Boolean = reglages(contexte).getBoolean(CLE_ACTIF, false) // Lit l'état

        // Ajoute une réponse à la liste en attente (48 au maximum, les plus anciennes sont oubliées).
        fun mettreEnAttente(contexte: Context, texte: String) { // Reçoit le contexte et le texte de la réponse
            val liste = JSONArray(reglages(contexte).getString(CLE_ATTENTE, "[]")) // Liste actuelle
            liste.put(JSONObject().put("texte", texte).put("date", System.currentTimeMillis())) // Ajoute la réponse avec l'heure
            val garde = JSONArray() // Nouvelle liste limitée
            for (i in maxOf(0, liste.length() - 48) until liste.length()) garde.put(liste.get(i)) // Copie les 48 dernières
            reglages(contexte).edit().putString(CLE_ATTENTE, garde.toString()).apply() // Enregistre
        } // Fin de mettreEnAttente

        // Renvoie puis vide la liste des réponses en attente.
        fun prendreEnAttente(contexte: Context): JSONArray { // Reçoit le contexte
            val liste = JSONArray(reglages(contexte).getString(CLE_ATTENTE, "[]")) // Liste actuelle
            reglages(contexte).edit().remove(CLE_ATTENTE).apply() // La vide
            return liste // La renvoie
        } // Fin de prendreEnAttente

        // Renvoie puis oublie la raison d'un arrêt automatique (null s'il n'y en a pas).
        fun prendreRaisonArret(contexte: Context): String? { // Reçoit le contexte
            val raison = reglages(contexte).getString(CLE_ARRET, null) // Raison enregistrée
            reglages(contexte).edit().remove(CLE_ARRET).apply() // Elle ne sera montrée qu'une fois
            return raison // La renvoie
        } // Fin de prendreRaisonArret
    } // Fin des valeurs communes

    // Exécutée par Android toutes les heures.
    override fun doWork(): Result { // Aucun paramètre
        val pin = CoffrePin.lire(applicationContext) // PIN déchiffré
        if (pin == null) { // Pas de PIN utilisable
            arreter(applicationContext, "Le PIN Orange Money n'est plus disponible : la consultation automatique est arrêtée.") // Arrête avec explication
            Notifier.afficher(applicationContext, "Consultation du solde arrêtée", "Le PIN Orange Money est introuvable.") // Prévient
            return Result.success() // Fin
        } // Fin du cas sans PIN
        val attente = CountDownLatch(1) // Verrou levé à l'arrivée de la réponse
        var reussi = false // Résultat de l'USSD
        var texte = "" // Texte reçu
        UssdOm.interroger(applicationContext, pin) { ok, t -> reussi = ok; texte = t; attente.countDown() } // Envoie l'USSD et note la réponse
        if (!attente.await(60, TimeUnit.SECONDS)) return Result.success() // Pas de réponse en 60 s : on réessaiera à l'heure suivante
        if (!reussi) return Result.success() // Échec technique (réseau…) : on réessaiera à l'heure suivante, sans arrêter
        if (texte.contains("solde", ignoreCase = true)) { // Réponse qui parle d'un solde
            mettreEnAttente(applicationContext, texte) // À enregistrer à la prochaine ouverture
        } else { // Autre réponse (PIN refusé, service indisponible…)
            arreter(applicationContext, "Réponse inattendue d'Orange Money : « $texte ». La consultation automatique est arrêtée par sécurité (vérifiez votre PIN).") // Arrête avec la réponse
            Notifier.afficher(applicationContext, "Consultation du solde arrêtée", "Réponse inattendue d'Orange Money. Vérifiez votre PIN dans Volako.") // Prévient
        } // Fin du choix
        return Result.success() // Terminé
    } // Fin de doWork
} // Fin de la classe
