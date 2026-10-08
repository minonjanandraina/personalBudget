package org.minonja.volako // Dossier du code de l'application

import android.Manifest // Liste des permissions Android
import android.content.Context // Contexte (réglages natifs)
import android.net.Uri // Adresse (ici : celle de la boîte de réception des SMS)
import com.getcapacitor.JSArray // Tableau renvoyé à la partie web
import com.getcapacitor.JSObject // Objet renvoyé à la partie web
import com.getcapacitor.PermissionState // État d'une permission (accordée, refusée...)
import com.getcapacitor.Plugin // Classe de base d'un plugin Capacitor
import com.getcapacitor.PluginCall // Appel venant de la partie web
import com.getcapacitor.PluginMethod // Marque une fonction appelable depuis la partie web
import com.getcapacitor.annotation.CapacitorPlugin // Déclare le plugin
import com.getcapacitor.annotation.Permission // Déclare une permission demandée par le plugin

// Plugin « SmsMm » : lit les SMS de la boîte de réception qui viennent d'un expéditeur donné (Mobile Money).
// La partie web l'appelle par SmsMm.checkPermissions(), SmsMm.requestPermissions() (fournies par Capacitor) et SmsMm.lireSms(...).
@CapacitorPlugin(name = "SmsMm", permissions = [ // Nom du plugin et permissions demandées ensemble
    Permission(strings = [Manifest.permission.READ_SMS], alias = "sms"), // Lire les SMS
    Permission(strings = [Manifest.permission.RECEIVE_SMS], alias = "reception"), // Être prévenu à l'arrivée d'un SMS (notification)
    Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications") // Afficher des notifications (Android 13 et plus)
]) // Fin des permissions
class SmsMmPlugin : Plugin() { // Début de la classe

    @PluginMethod // Appelable depuis la partie web
    fun lireSms(appel: PluginCall) { // Reçoit l'appel (avec « expediteur » et « depuis »)
        if (getPermissionState("sms") != PermissionState.GRANTED) { // La permission n'est pas accordée
            appel.reject("Permission de lire les SMS refusée") // Refuse avec un message
            return // Arrête ici
        } // Fin du contrôle de permission
        val expediteur = appel.getString("expediteur") ?: "OrangeMoney" // Nom de l'expéditeur (Mobile Money par défaut)
        context.getSharedPreferences(SmsMmReceiver.PREFERENCES, Context.MODE_PRIVATE) // Réglages natifs
            .edit().putString(SmsMmReceiver.CLE_EXPEDITEUR, expediteur).apply() // Mémorise l'expéditeur pour que le récepteur de notification le connaisse
        val depuis = appel.getLong("depuis") ?: 0L // Date de départ en millisecondes (0 = depuis toujours)
        val messages = JSArray() // Liste des SMS trouvés
        try { // Tente la lecture
            val curseur = context.contentResolver.query( // Interroge la boîte de réception
                Uri.parse("content://sms/inbox"), // Boîte de réception
                arrayOf("body", "date"), // Colonnes lues : texte et date
                "address LIKE ? AND date >= ?", // Filtre : expéditeur contenant le nom, et date de départ
                arrayOf("%$expediteur%", depuis.toString()), // Valeurs du filtre
                "date ASC" // Du plus ancien au plus récent
            ) // Fin de la requête
            curseur?.use { // Referme le curseur à la fin
                val colonneTexte = it.getColumnIndexOrThrow("body") // Position de la colonne « texte »
                val colonneDate = it.getColumnIndexOrThrow("date") // Position de la colonne « date »
                while (it.moveToNext()) { // Pour chaque SMS
                    val sms = JSObject() // Un SMS pour la partie web
                    sms.put("corps", it.getString(colonneTexte) ?: "") // Texte du SMS
                    sms.put("date", it.getLong(colonneDate)) // Date de réception en millisecondes
                    messages.put(sms) // Ajoute à la liste
                } // Fin de la boucle
            } // Fin de l'utilisation du curseur
        } catch (erreur: Exception) { // Si la lecture échoue
            appel.reject("Lecture des SMS impossible : " + (erreur.message ?: "erreur inconnue")) // Renvoie l'erreur
            return // Arrête ici
        } // Fin du try/catch
        val resultat = JSObject() // Réponse
        resultat.put("messages", messages) // Place la liste dans la réponse
        appel.resolve(resultat) // Envoie la réponse à la partie web
    } // Fin de lireSms
} // Fin de la classe
