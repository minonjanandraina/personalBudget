package org.minonja.volako // Dossier du code de l'application

import android.content.BroadcastReceiver // Classe de base d'un récepteur de messages système
import android.content.Context // Contexte de l'application
import android.content.Intent // Message système reçu
import android.provider.Telephony // Outils pour lire un SMS reçu

// Récepteur « SmsMmReceiver » : Android l'appelle à chaque SMS reçu, même application fermée.
// Si le SMS vient de l'expéditeur Mobile Money, il affiche une notification. Il n'écrit RIEN dans la base :
// l'import se fait à la prochaine ouverture de Volako (le parser et la base restent en JavaScript, testés sous Windows).
class SmsMmReceiver : BroadcastReceiver() { // Début de la classe

    companion object { // Valeurs communes
        const val PREFERENCES = "volako" // Nom du petit fichier de réglages natif
        const val CLE_EXPEDITEUR = "expediteur" // Clé du nom d'expéditeur mémorisé
    } // Fin des valeurs communes

    override fun onReceive(contexte: Context, message: Intent) { // Appelée par Android à chaque SMS reçu
        if (message.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return // Ignore tout ce qui n'est pas un SMS reçu
        val expediteur = contexte.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE) // Ouvre les réglages natifs
            .getString(CLE_EXPEDITEUR, "OrangeMoney") ?: "OrangeMoney" // Nom d'expéditeur mémorisé par l'application (défaut : OrangeMoney)
        val venantDOm = Telephony.Sms.Intents.getMessagesFromIntent(message) // Les morceaux du SMS reçu
            .any { it.originatingAddress?.contains(expediteur, ignoreCase = true) == true } // Vrai si l'expéditeur contient le nom Mobile Money
        if (!venantDOm) return // Autre expéditeur : rien à faire
        Notifier.afficher(contexte, "Nouvelle opération Mobile Money", "Ouvrez Volako pour l'importer et la classer.") // Notification (le contenu du SMS n'est volontairement pas recopié)
    } // Fin de onReceive
} // Fin de la classe
