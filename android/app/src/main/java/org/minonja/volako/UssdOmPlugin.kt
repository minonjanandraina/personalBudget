package org.minonja.volako // Dossier du code de l'application

import android.Manifest // Liste des permissions Android
import com.getcapacitor.JSObject // Objet renvoyé à la partie web
import com.getcapacitor.PermissionState // État d'une permission (accordée, refusée...)
import com.getcapacitor.Plugin // Classe de base d'un plugin Capacitor
import com.getcapacitor.PluginCall // Appel venant de la partie web
import com.getcapacitor.PluginMethod // Marque une fonction appelable depuis la partie web
import com.getcapacitor.annotation.CapacitorPlugin // Déclare le plugin
import com.getcapacitor.annotation.Permission // Déclare une permission demandée par le plugin

// Plugin « UssdOm » : envoie un code USSD COMPLET préparé par l'application (consultation du solde, opérations dynamiques).
// Le PIN Orange Money n'est jamais enregistré : la partie web le demande à l'utilisateur à chaque envoi et l'insère dans le code.
// Le texte de la réponse est analysé par la partie web (src/core/ussd-om.js), pas ici.
@CapacitorPlugin(name = "UssdOm", permissions = [Permission(strings = [Manifest.permission.CALL_PHONE], alias = "ussd")]) // Nom et permissions « téléphone »
class UssdOmPlugin : Plugin() { // Début de la classe

    override fun load() { // Appelée au chargement du plugin
        AnciensReglagesOm.nettoyer(context) // Efface ce que les anciennes versions gardaient (PIN chiffré, tâche horaire)
    } // Fin de load

    @PluginMethod // Envoie un code USSD complet
    fun envoyerCode(appel: PluginCall) { // Reçoit « code »
        val code = appel.getString("code") // Code complet, PIN déjà inséré
        if (code == null || !Regex("^[#*][0-9*#]{1,98}$").matches(code) || !code.endsWith("#")) { appel.reject("Code USSD invalide."); return } // Seuls chiffres, * et # sont acceptés
        if (getPermissionState("ussd") != PermissionState.GRANTED) { appel.reject("Permission « téléphone » non accordée."); return } // Permission absente
        UssdOm.envoyer(context, code) { reussi, texte -> // Envoie ; la fonction est appelée à la réponse
            if (reussi) { val r = JSObject(); r.put("texte", texte); appel.resolve(r) } else appel.reject(texte) // Renvoie le texte ou l'erreur
        } // Fin de l'envoi
    } // Fin de envoyerCode
} // Fin de la classe
