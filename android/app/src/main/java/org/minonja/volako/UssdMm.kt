package org.minonja.volako // Dossier du code de l'application

import android.Manifest // Liste des permissions Android
import android.content.Context // Contexte de l'application
import android.content.pm.PackageManager // Pour savoir si une permission est accordée
import android.os.Handler // File d'attente où Android rend la réponse
import android.os.Looper // Fil principal de l'application
import android.telephony.TelephonyManager // API téléphonie d'Android (envoi d'USSD, Android 8 et plus)

// Envoi d'un code USSD complet (consultation du solde, opérations dynamiques) par l'API téléphonie d'Android.
object UssdMm { // Objet unique


    // Envoie un code USSD quelconque. « fin(reussi, texte) » est appelée UNE fois : texte de la réponse, ou message d'erreur.
    fun envoyer(contexte: Context, codeUssd: String, fin: (Boolean, String) -> Unit) { // Reçoit le contexte, le code complet et la fonction appelée à la fin
        if (contexte.checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) { // Permission d'appel absente
            fin(false, "Permission « téléphone » non accordée") // Erreur
            return // Arrête ici
        } // Fin du contrôle de permission
        val telephonie = contexte.getSystemService(TelephonyManager::class.java) // API téléphonie
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
