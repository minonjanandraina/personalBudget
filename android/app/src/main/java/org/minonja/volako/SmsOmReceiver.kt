package org.minonja.volako // Dossier du code de l'application

import android.app.NotificationChannel // Canal de notification (obligatoire depuis Android 8)
import android.app.NotificationManager // Gestionnaire des notifications
import android.app.PendingIntent // Action déclenchée quand on touche la notification
import android.content.BroadcastReceiver // Classe de base d'un récepteur de messages système
import android.content.Context // Contexte de l'application
import android.content.Intent // Message système reçu
import android.app.Notification // Notification à afficher
import android.provider.Telephony // Outils pour lire un SMS reçu

// Récepteur « SmsOmReceiver » : Android l'appelle à chaque SMS reçu, même application fermée.
// Si le SMS vient de l'expéditeur Orange Money, il affiche une notification. Il n'écrit RIEN dans la base :
// l'import se fait à la prochaine ouverture de Volako (le parser et la base restent en JavaScript, testés sous Windows).
class SmsOmReceiver : BroadcastReceiver() { // Début de la classe

    companion object { // Valeurs communes
        const val PREFERENCES = "volako" // Nom du petit fichier de réglages natif
        const val CLE_EXPEDITEUR = "expediteur" // Clé du nom d'expéditeur mémorisé
        const val CANAL = "operations_om" // Identifiant du canal de notification
    } // Fin des valeurs communes

    override fun onReceive(contexte: Context, message: Intent) { // Appelée par Android à chaque SMS reçu
        if (message.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return // Ignore tout ce qui n'est pas un SMS reçu
        val expediteur = contexte.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE) // Ouvre les réglages natifs
            .getString(CLE_EXPEDITEUR, "OrangeMoney") ?: "OrangeMoney" // Nom d'expéditeur mémorisé par l'application (défaut : OrangeMoney)
        val venantDOm = Telephony.Sms.Intents.getMessagesFromIntent(message) // Les morceaux du SMS reçu
            .any { it.originatingAddress?.contains(expediteur, ignoreCase = true) == true } // Vrai si l'expéditeur contient le nom Orange Money
        if (!venantDOm) return // Autre expéditeur : rien à faire
        val gestionnaire = contexte.getSystemService(NotificationManager::class.java) // Gestionnaire des notifications
        if (!gestionnaire.areNotificationsEnabled()) return // Notifications refusées par l'utilisateur : on se tait
        gestionnaire.createNotificationChannel( // Crée le canal (sans effet s'il existe déjà)
            NotificationChannel(CANAL, "Opérations Orange Money", NotificationManager.IMPORTANCE_DEFAULT) // Nom visible dans les réglages Android
        ) // Fin de la création du canal
        val ouvrir = PendingIntent.getActivity( // Action : ouvrir Volako
            contexte, 0, // Contexte et code de la demande
            Intent(contexte, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), // Ouvre l'écran principal
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT // Options de sécurité
        ) // Fin de l'action
        val notification = Notification.Builder(contexte, CANAL) // Construit la notification
            .setSmallIcon(contexte.applicationInfo.icon) // Icône de l'application
            .setContentTitle("Nouvelle opération Orange Money") // Titre (le contenu du SMS n'est volontairement pas recopié)
            .setContentText("Ouvrez Volako pour l'importer et la classer.") // Texte
            .setContentIntent(ouvrir) // Action au toucher
            .setAutoCancel(true) // Disparaît quand on la touche
            .build() // Termine la construction
        gestionnaire.notify(System.currentTimeMillis().toInt(), notification) // Affiche (identifiant unique : une notification par SMS)
    } // Fin de onReceive
} // Fin de la classe
