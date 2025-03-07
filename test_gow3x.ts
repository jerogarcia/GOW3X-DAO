import * as anchor from "@project-serum/anchor";
import { Program, BN } from "@project-serum/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";

const { Connection, clusterApiUrl } = anchor.web3;

async function main() {
  // Configuración de la conexión y wallet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = Keypair.generate(); // Reemplaza con tu Keypair real
  const provider = new anchor.Provider(connection, new anchor.Wallet(wallet), { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Cargar el programa
  const programId = new PublicKey("G3XDao11111111111111111111111111111111111");
  const idl = /* Coloca el IDL generado por Anchor aquí */; // Ver nota abajo
  const program = new Program(idl, programId, provider);

  // Crear y configurar el mint
  const mint = await Token.createMint(
    connection,
    wallet,
    wallet.publicKey,
    null,
    6, // 6 decimales
    TOKEN_PROGRAM_ID
  );

  // Cuenta de tokens del admin
  const adminTokenAccount = await mint.createAccount(wallet.publicKey);

  // Inicializar la DAO
  const [configPda, configBump] = await PublicKey.findProgramAddress([Buffer.from("config")], programId);
  await program.rpc.initialize(wallet.publicKey, {
    accounts: {
      config: configPda,
      admin: wallet.publicKey,
      mint: mint.publicKey,
      adminTokenAccount: adminTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    signers: [wallet],
  });
  console.log("DAO inicializada con config PDA:", configPda.toBase58());

  // Distribuir GOW desde G2X
  const recipient = Keypair.generate();
  const recipientTokenAccount = await mint.createAccount(recipient.publicKey);
  const ethAddress = Buffer.from("0x1234567890abcdef1234567890abcdef12345678", "hex"); // Ejemplo
  await program.rpc.distributeGowFromG2x(
    [[Array.from(ethAddress), recipient.publicKey, new BN(1000_000_000)]], // 1K GOW
    {
      accounts: {
        config: configPda,
        admin: wallet.publicKey,
        adminTokenAccount: adminTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts: [{ pubkey: recipientTokenAccount, isSigner: false, isWritable: true }],
      signers: [wallet],
    }
  );
  console.log("Distribución realizada a:", recipient.publicKey.toBase58());

  // Configurar vesting
  const [vestingPda, vestingBump] = await PublicKey.findProgramAddress(
    [Buffer.from("vesting"), recipient.publicKey.toBuffer()],
    programId
  );
  const vestingTokenAccount = await mint.createAccount(vestingPda);
  const milestones = [[Date.now() / 1000 + 60, new BN(500_000_000)]]; // 500K en 60 segundos
  await program.rpc.setupVesting(recipient.publicKey, new BN(1000_000_000), milestones, false, {
    accounts: {
      config: configPda,
      admin: wallet.publicKey,
      adminTokenAccount: adminTokenAccount,
      vestingSchedule: vestingPda,
      vestingTokenAccount: vestingTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      recipient: recipient.publicKey,
    },
    signers: [wallet],
  });
  console.log("Vesting configurado para:", recipient.publicKey.toBase58());

  // Reclamar tokens de vesting (manual)
  await new Promise((resolve) => setTimeout(resolve, 61000)); // Esperar 61 segundos
  await program.rpc.claimVestedTokens({
    accounts: {
      vestingSchedule: vestingPda,
      vestingTokenAccount: vestingTokenAccount,
      recipientTokenAccount: recipientTokenAccount,
      recipient: recipient.publicKey,
      vestingPda: vestingPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    signers: [recipient],
    instructions: [],
    remainingAccounts: [{ pubkey: vestingPda, isSigner: false, isWritable: false }],
  });
  console.log("Tokens de vesting reclamados");

  // Iniciar staking
  const [stakePda, stakeBump] = await PublicKey.findProgramAddress(
    [Buffer.from("stake"), wallet.publicKey.toBuffer()],
    programId
  );
  const stakeTokenAccount = await mint.createAccount(stakePda);
  await program.rpc.startStaking(new BN(2000_000_000), {
    accounts: {
      stake: stakePda,
      user: wallet.publicKey,
      userTokenAccount: adminTokenAccount,
      stakeTokenAccount: stakeTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    signers: [wallet],
  });
  console.log("Staking iniciado");

  // Finalizar staking
  await program.rpc.unstake({
    accounts: {
      config: configPda,
      stake: stakePda,
      stakeTokenAccount: stakeTokenAccount,
      ownerTokenAccount: adminTokenAccount,
      owner: wallet.publicKey,
      stakePda: stakePda,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    signers: [wallet],
    remainingAccounts: [],
  });
  console.log("Staking finalizado");

  // Quemar tokens
  await program.rpc.burnTokens(new BN(1000_000_000), {
    accounts: {
      config: configPda,
      admin: wallet.publicKey,
      adminTokenAccount: adminTokenAccount,
      mint: mint.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    signers: [wallet],
  });
  console.log("Tokens quemados");

  // Actualizar administradores
  const newAdmin = Keypair.generate();
  await program.rpc.updateAdmins([newAdmin.publicKey], {
    accounts: {
      config: configPda,
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    },
    signers: [wallet],
  });
  console.log("Administradores actualizados");
}

main().catch((err) => console.error(err));

// Nota: Necesitas el IDL del programa. Tras compilar con Anchor, lo encuentras en target/idl/gow3x.json
