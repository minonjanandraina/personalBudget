package org.minonja.volako // Dossier du code de l'application

import android.app.Notification // Notification à afficher
import android.app.NotificationChannel // Canal de notification (obligatoire depuis Android 8)
import android.app.NotificationManager // Gestionnaire des notifications
import android.app.PendingIntent // Action déclenchée quand on touche la notification
import android.content.Context // Contexte de l'application
import android.content.Intent // Message système

// Affiche une notification simple qui ouvre Volako quand on la touche (utilisée par le récepteur de SMS et par la consultation USSD).
object Notifier { // Objet unique
    private const val CANAL = "operations_om" // Identifiant du canal de notification

    fun afficher(contexte: Context, titre: String, texte: String) { // Reçoit le contexte, le titre et le texte
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
            .setContentTitle(titre) // Titre
            .setContentText(texte) // Texte
            .setContentIntent(ouvrir) // Action au toucher
            .setAutoCancel(true) // Disparaît quand on la touche
            .build() // Termine la construction
        gestionnaire.notify(System.currentTimeMillis().toInt(), notification) // Affiche (identifiant unique : une notification par événement)
    } // Fin de afficher
} // Fin de l'objet
