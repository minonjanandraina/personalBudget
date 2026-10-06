package org.minonja.volako; // Dossier du code de l'application

import android.os.Bundle; // Informations de démarrage de l'écran
import com.getcapacitor.BridgeActivity; // Écran principal fourni par Capacitor

// Écran principal de l'application : il affiche la partie web et enregistre notre plugin de lecture des SMS.
public class MainActivity extends BridgeActivity { // Début de la classe
    @Override // Remplace la fonction de démarrage de la classe parente
    public void onCreate(Bundle savedInstanceState) { // Appelée au démarrage de l'écran
        registerPlugin(SmsOmPlugin.class); // Enregistre le plugin SMS (à faire AVANT super.onCreate)
        registerPlugin(UssdOmPlugin.class); // Enregistre le plugin USSD (PIN chiffré, consultation du solde)
        super.onCreate(savedInstanceState); // Démarre l'écran normalement
    } // Fin de onCreate
} // Fin de la classe
