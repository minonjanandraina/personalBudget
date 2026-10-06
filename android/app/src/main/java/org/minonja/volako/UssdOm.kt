package org.minonja.volako // Dossier du code de l'application

import android.Manifest // Liste des permissions Android
import android.content.Context // Contexte de l'application
import android.content.pm.PackageManager // Pour savoir si une permission est accordée
import android.os.Handler // File d'attente où Android rend la réponse
import android.os.Looper // Fil principal de l'application
import android.telephony.TelephonyManager // API téléphonie d'Android (envoi d'USSD, Android 8 et plus)

// Envoi du code USSD de consultation du solde Orange Money.
// Code : #144*5*3*PIN*# (le « # » final est ajouté ici ; à vérifier sur le téléphone : seul « #144*5*3*PIN* » figurait dans la demande).
object UssdOm { // Objet unique

    // Texte du code USSD pour un PIN donné.
    fun code(pin: String): String = "#144*5*3*$pin*#" // Modèle du code (seul endroit à corriger si le format change)

    // Envoie l'USSD. « fin(reussi, texte) » est appelée UNE fois : texte de la réponse, ou message d'erreur.
    fun interroger(contexte: Context, pin: String, fin: (Boolean, String) -> Unit) { // Reçoit le contexte, le PIN et la fonction appelée à la fin
        if (contexte.checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) { // Permission d'appel absente
            fin(false, "Permission « téléphone » non accordée") // Erreur
            return // Arrête ici
        } // Fin du contrôle de permission
        val telephonie = contexte.getSystemService(TelephonyManager::class.java) // API téléphonie
        try { // Tente l'envoi
            telephonie.sendUssdRequest( // Envoie la demande USSD
                code(pin), // Texte du code
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
    } // Fin de interroger
} // Fin de l'objet
