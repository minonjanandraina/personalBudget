package org.minonja.volako // Dossier du code de l'application

import android.content.Context // Contexte de l'application
import android.security.keystore.KeyGenParameterSpec // Description d'une clé du coffre Android
import android.security.keystore.KeyProperties // Noms des algorithmes
import android.util.Base64 // Conversion binaire <-> texte
import java.security.KeyStore // Coffre à clés d'Android (la clé ne quitte jamais le téléphone)
import javax.crypto.Cipher // Outil de chiffrement
import javax.crypto.KeyGenerator // Fabrique de clés
import javax.crypto.SecretKey // Clé secrète
import javax.crypto.spec.GCMParameterSpec // Paramètres du mode GCM

// Coffre du PIN Orange Money : le PIN est CHIFFRÉ (AES-256) avec une clé fabriquée et gardée par le coffre Android (Keystore).
// Seul le texte chiffré est enregistré (dans les réglages privés de l'application) ; il est inutilisable sans le coffre de CE téléphone.
// Le PIN doit pouvoir être relu (pour composer le code USSD) : c'est donc un chiffrement réversible, pas un hachage.
object CoffrePin { // Objet unique (pas besoin d'en créer plusieurs)
    private const val ALIAS = "volako_pin_om" // Nom de la clé dans le coffre
    private const val CLE_PIN = "pin_chiffre" // Clé du texte chiffré dans les réglages natifs

    // Récupère la clé du coffre, ou la crée la première fois.
    private fun cle(): SecretKey { // Aucun paramètre
        val coffre = KeyStore.getInstance("AndroidKeyStore") // Ouvre le coffre Android
        coffre.load(null) // Charge son contenu
        (coffre.getKey(ALIAS, null) as? SecretKey)?.let { return it } // Clé déjà créée : on la renvoie
        val fabrique = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore") // Fabrique de clés AES
        fabrique.init( // Décrit la clé voulue
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT) // Sert à chiffrer et déchiffrer
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM) // Mode GCM (détecte toute modification)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE) // Pas de bourrage avec GCM
                .setKeySize(256) // Clé de 256 bits
                .build() // Termine la description
        ) // Fin de l'initialisation
        return fabrique.generateKey() // Crée et range la clé dans le coffre
    } // Fin de cle

    // Chiffre le PIN et le range dans les réglages natifs.
    fun enregistrer(contexte: Context, pin: String) { // Reçoit le contexte et le PIN en clair
        val chiffreur = Cipher.getInstance("AES/GCM/NoPadding") // Chiffreur AES-GCM
        chiffreur.init(Cipher.ENCRYPT_MODE, cle()) // Prêt à chiffrer (Android choisit un vecteur aléatoire)
        val chiffre = chiffreur.doFinal(pin.toByteArray(Charsets.UTF_8)) // PIN chiffré
        val tout = chiffreur.iv + chiffre // Vecteur d'initialisation + texte chiffré
        contexte.getSharedPreferences(SmsOmReceiver.PREFERENCES, Context.MODE_PRIVATE) // Réglages natifs privés
            .edit().putString(CLE_PIN, Base64.encodeToString(tout, Base64.NO_WRAP)).apply() // Range en texte
    } // Fin de enregistrer

    // Relit et déchiffre le PIN (null s'il n'y en a pas, ou s'il est illisible).
    fun lire(contexte: Context): String? { // Reçoit le contexte
        val texte = contexte.getSharedPreferences(SmsOmReceiver.PREFERENCES, Context.MODE_PRIVATE).getString(CLE_PIN, null) ?: return null // Rien d'enregistré
        return try { // Tente le déchiffrement
            val tout = Base64.decode(texte, Base64.NO_WRAP) // Retrouve les octets
            val dechiffreur = Cipher.getInstance("AES/GCM/NoPadding") // Déchiffreur AES-GCM
            dechiffreur.init(Cipher.DECRYPT_MODE, cle(), GCMParameterSpec(128, tout.copyOfRange(0, 12))) // Les 12 premiers octets = vecteur
            String(dechiffreur.doFinal(tout.copyOfRange(12, tout.size)), Charsets.UTF_8) // Le reste = PIN chiffré
        } catch (erreur: Exception) { null } // Illisible (clé perdue, texte abîmé) : comme s'il n'y avait pas de PIN
    } // Fin de lire

    // Vrai si un PIN est enregistré.
    fun existe(contexte: Context): Boolean = contexte.getSharedPreferences(SmsOmReceiver.PREFERENCES, Context.MODE_PRIVATE).contains(CLE_PIN) // Présence du texte chiffré

    // Efface le PIN.
    fun effacer(contexte: Context) { // Reçoit le contexte
        contexte.getSharedPreferences(SmsOmReceiver.PREFERENCES, Context.MODE_PRIVATE).edit().remove(CLE_PIN).apply() // Supprime le texte chiffré
    } // Fin de effacer
} // Fin de l'objet
