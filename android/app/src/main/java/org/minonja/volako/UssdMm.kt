package org.minonja.volako // Dossier du code de l'application

import android.Manifest // Liste des permissions Android
import android.content.Context // Contexte de l'application
import android.content.pm.PackageManager // Pour savoir si une permission est accordée
import android.os.Handler // File d'attente où Android rend la réponse
import android.os.Looper // Fil principal de l'application
import android.telephony.SubscriptionManager // Liste des cartes SIM actives
import android.telephony.TelephonyManager // API téléphonie d'Android (envoi d'USSD, Android 8 et plus)

// Envoi d'un code USSD complet (consultation du solde, opérations dynamiques) par l'API téléphonie d'Android.
object UssdMm { // Objet unique

    // Une carte SIM active : identifiant Android, emplacement (1 ou 2) et nom affiché.
    data class Sim(val id: Int, val emplacement: Int, val nom: String) // Les trois informations d'une SIM

    // Liste les SIM actives. Renvoie null si la permission « état du téléphone » manque.
    fun sims(contexte: Context): List<Sim>? { // Reçoit le contexte
        if (contexte.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return null // Permission absente
        val gestionnaire = contexte.getSystemService(SubscriptionManager::class.java) // Gestionnaire des abonnements (SIM)
        return try { // Tente la lecture
            (gestionnaire.activeSubscriptionInfoList ?: emptyList()).map { // Une ligne par SIM active
                Sim(it.subscriptionId, it.simSlotIndex + 1, (it.displayName ?: it.carrierName ?: "SIM").toString()) // Identifiant, emplacement (1 = premier), nom
            } // Fin de la conversion
        } catch (erreur: SecurityException) { null } // Android refuse la lecture
    } // Fin de sims


    // Envoie un code USSD quelconque. « fin(reussi, texte) » est appelée UNE fois : texte de la réponse, ou message d'erreur.
    fun envoyer(contexte: Context, codeUssd: String, idSim: Int? = null, fin: (Boolean, String) -> Unit) { // Reçoit le contexte, le code complet, la SIM choisie (facultative) et la fonction appelée à la fin
        if (contexte.checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) { // Permission d'appel absente
            fin(false, "Permission « téléphone » non accordée") // Erreur
            return // Arrête ici
        } // Fin du contrôle de permission
        var telephonie = contexte.getSystemService(TelephonyManager::class.java) // API téléphonie (SIM par défaut)
        if (idSim != null) { // Une SIM précise est demandée
            val actives = sims(contexte) // SIM actuellement présentes
            if (actives == null) { fin(false, "Permission « état du téléphone » non accordée : impossible d'utiliser la SIM choisie."); return } // Permission absente
            if (actives.none { it.id == idSim }) { fin(false, "La SIM choisie n'est plus présente. Choisissez-la de nouveau dans « Consultation du solde »."); return } // SIM retirée ou remplacée : rien n'est envoyé
            telephonie = telephonie.createForSubscriptionId(idSim) // Utilise la SIM choisie
        } // Fin du choix de SIM
        try { // Tente l'envoi
            telephonie.sendUssdRequest( // Envoie la demande USSD
                codeUssd, // Texte du code
                object : TelephonyManager.UssdResponseCallback() { // Reçoit la réponse du réseau
                    override fun onReceiveUssdResponse(tm: TelephonyManager, requete: String, reponse: CharSequence) { // Réponse reçue
                        fin(true, reponse.toString()) // Transmet le texte de la réponse
                    } // Fin de onReceiveUssdResponse
                    override fun onReceiveUssdResponseFailed(tm: TelephonyManager, requete: String, codeErreur: Int) { // Échec
                        fin(false, "Le réseau n'a pas répondu (code $codeErreur)") // Transmet l'erreur
                    } // Fin de onReceiveUssdResponseFailed
                }, // Fin du rappel
                Handler(Looper.getMainLooper()) // La réponse arrive sur le fil principal
            ) // Fin de l'envoi
        } catch (erreur: Exception) { // Si Android refuse l'envoi
            fin(false, "Envoi USSD impossible : " + (erreur.message ?: "erreur inconnue")) // Transmet l'erreur
        } // Fin du try/catch
    } // Fin de envoyer
} // Fin de l'objet
