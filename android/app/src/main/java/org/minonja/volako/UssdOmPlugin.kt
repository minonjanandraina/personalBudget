package org.minonja.volako // Dossier du code de l'application

import android.Manifest // Liste des permissions Android
import com.getcapacitor.JSObject // Objet renvoyé à la partie web
import com.getcapacitor.PermissionState // État d'une permission (accordée, refusée...)
import com.getcapacitor.Plugin // Classe de base d'un plugin Capacitor
import com.getcapacitor.PluginCall // Appel venant de la partie web
import com.getcapacitor.PluginMethod // Marque une fonction appelable depuis la partie web
import com.getcapacitor.annotation.CapacitorPlugin // Déclare le plugin
import com.getcapacitor.annotation.Permission // Déclare une permission demandée par le plugin

// Plugin « UssdOm » : PIN Orange Money chiffré, consultation du solde par USSD, planification toutes les heures.
// Le texte de la réponse est analysé par la partie web (src/core/ussd-om.js), pas ici.
@CapacitorPlugin(name = "UssdOm", permissions = [Permission(strings = [Manifest.permission.CALL_PHONE], alias = "ussd")]) // Nom et permissions « téléphone »
class UssdOmPlugin : Plugin() { // Début de la classe

    @PluginMethod // Enregistre le PIN (chiffré par le coffre Android)
    fun definirPin(appel: PluginCall) { // Reçoit « pin »
        val pin = appel.getString("pin") // PIN saisi
        if (pin == null || !Regex("^[0-9]{4,8}$").matches(pin)) { appel.reject("Le PIN doit contenir de 4 à 8 chiffres."); return } // Vérifie le format
        try { CoffrePin.enregistrer(context, pin); appel.resolve() } catch (erreur: Exception) { appel.reject("Chiffrement du PIN impossible : " + (erreur.message ?: "erreur inconnue")) } // Chiffre et range
    } // Fin de definirPin

    @PluginMethod // Efface le PIN et arrête la consultation automatique
    fun effacerPin(appel: PluginCall) { // Aucun paramètre
        CoffrePin.effacer(context) // Efface le PIN
        ConsultationWorker.arreter(context) // Sans PIN, plus de consultation automatique
        appel.resolve() // Terminé
    } // Fin de effacerPin

    @PluginMethod // Interroge le solde maintenant
    fun consulterSolde(appel: PluginCall) { // Aucun paramètre
        if (getPermissionState("ussd") != PermissionState.GRANTED) { appel.reject("Permission « téléphone » non accordée."); return } // Permission absente
        val pin = CoffrePin.lire(context) // PIN déchiffré
        if (pin == null) { appel.reject("Aucun PIN Orange Money enregistré."); return } // Pas de PIN
        UssdOm.interroger(context, pin) { reussi, texte -> // Envoie l'USSD ; la fonction est appelée à la réponse
            if (reussi) { val r = JSObject(); r.put("texte", texte); appel.resolve(r) } else appel.reject(texte) // Renvoie le texte ou l'erreur
        } // Fin de l'envoi
    } // Fin de consulterSolde

    @PluginMethod // Active ou arrête la consultation toutes les heures en arrière-plan
    fun programmerAuto(appel: PluginCall) { // Reçoit « actif »
        if (appel.getBoolean("actif") == true) { // Activation
            if (!CoffrePin.existe(context)) { appel.reject("Enregistrez d'abord votre PIN Orange Money."); return } // Il faut un PIN
            if (getPermissionState("ussd") != PermissionState.GRANTED) { appel.reject("Permission « téléphone » non accordée."); return } // Il faut la permission
            ConsultationWorker.activer(context) // Planifie
        } else ConsultationWorker.arreter(context) // Arrêt demandé
        appel.resolve() // Terminé
    } // Fin de programmerAuto

    @PluginMethod // État actuel
    fun etatUssd(appel: PluginCall) { // Aucun paramètre
        val r = JSObject() // Réponse
        r.put("pinDefini", CoffrePin.existe(context)) // Un PIN est-il enregistré
        r.put("actif", ConsultationWorker.actif(context)) // La consultation automatique est-elle active
        r.put("permission", getPermissionState("ussd") == PermissionState.GRANTED) // Permission accordée
        r.put("code", UssdOm.code("••••")) // Forme du code composé, PIN masqué (pour vérification par l'utilisateur)
        appel.resolve(r) // Envoie
    } // Fin de etatUssd

    @PluginMethod // Reprend les réponses reçues en arrière-plan (et la raison d'un éventuel arrêt)
    fun recupererReponses(appel: PluginCall) { // Aucun paramètre
        val r = JSObject() // Réponse
        r.put("reponses", ConsultationWorker.prendreEnAttente(context)) // Réponses en attente (vidées)
        r.put("arret", ConsultationWorker.prendreRaisonArret(context)) // Raison d'arrêt, une seule fois
        appel.resolve(r) // Envoie
    } // Fin de recupererReponses
} // Fin de la classe
