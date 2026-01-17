const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONFIGURAÇÕES (MANTIDAS)
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
const SENHA_ADMIN = "76811867";

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL CONECTADO"));

// BANCO DE DADOS (MANTIDO)
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    saldoGanhos: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0] }
}));

const Stats = mongoose.models.Stats || mongoose.model('Stats', new mongoose.Schema({ lucroTotal: { type: Number, default: 0 } }));
const Saque = mongoose.models.Saque || mongoose.model('Saque', new mongoose.Schema({ user: String, valor: Number, pix: String, status: { type: String, default: "Pendente" }, data: { type: Date, default: Date.now } }));

// --- LÓGICA DO TIMER CENTRALIZADA NO SERVIDOR ---
let tempo = 30;
let emPausa = false;

setInterval(() => {
    if (!emPausa) {
        if (tempo > 0) {
            tempo--;
        } else {
            // Quando chega a 0, o servidor trava por 11 segundos
            // (6s da animação da roleta + 5s do prêmio na tela)
            emPausa = true;
            setTimeout(() => {
                tempo = 30;
                emPausa = false;
            }, 11000); 
        }
    }
}, 1000);

// Rota para o frontend buscar o tempo exato do servidor
app.get('/api/tempo-real', (req, res) => {
    res.json({ segundos: tempo, pausa: emPausa });
});

// GIRO (MANTIDO E SINCRONIZADO)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });

    const totalApostado = u.bets.reduce((a, b) => a + b, 0);
    let menor = Math.min(...u.bets);
    let opcoes = [];
    u.bets.forEach((v, i) => { if (v === menor) opcoes.push(i); });
    const alvo = opcoes[Math.floor(Math.random() * opcoes.length)];
    
    const ganho = Number((u.bets[alvo] * 5).toFixed(2));
    const lucroRodada = totalApostado - ganho;
    await Stats.findOneAndUpdate({}, { $inc: { lucroTotal: lucroRodada } }, { upsert: true });
    
    const nS = Number((u.saldo + ganho).toFixed(2));
    const nSG = Number((u.saldoGanhos + ganho).toFixed(2));
    await User.findOneAndUpdate({ user: u.user }, { $set: { saldo: nS, saldoGanhos: nSG, bets: [0,0,0,0,0,0,0,0] } });
    
    res.json({ success: true, corAlvo: alvo, novoSaldo: nS, valorGanho: ganho });
});

// AS DEMAIS ROTAS (AUTH, PIX, ADMIN) CONTINUAM IGUAIS...
// [Insira aqui o restante do seu código original de Auth, Pix e Saque]

app.listen(process.env.PORT || 10000);
