const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONFIGURAÇÕES
const MP_TOKEN = "APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741";
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
const SENHA_ADMIN = "76811867";

mongoose.connect(MONGO_URI).then(() => console.log("💎 SLOTREAL ONLINE"));

const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    saldo: { type: Number, default: 0.00 },
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] } 
}));

// --- NOVO: SCHEMA PARA O SEU LUCRO ---
const Stats = mongoose.models.Stats || mongoose.model('Stats', new mongoose.Schema({
    lucroTotal: { type: Number, default: 0 }
}));

// TIMER DO JOGO
let tempo = 30;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

// SALVAR APOSTA
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { 
        saldo: req.body.saldo, 
        bets: req.body.bets 
    });
    res.json({ success: true });
});

// LÓGICA DO GIRO (COM CÁLCULO DE LUCRO ADICIONADO)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });

    // Calcula quanto o cara apostou no total nesta rodada
    const totalApostado = u.bets.reduce((a, b) => a + b, 0);

    let menorValor = Math.min(...u.bets);
    let opcoesGanhadoras = [];
    
    u.bets.forEach((valor, indice) => {
        if (valor === menorValor) opcoesGanhadoras.push(indice);
    });

    const corSorteada = opcoesGanhadoras[Math.floor(Math.random() * opcoesGanhadoras.length)];
    const valorApostadoNaCor = u.bets[corSorteada];
    const ganho = Number((valorApostadoNaCor * 5).toFixed(2)); 
    
    // --- NOVO: LOGICA DO SEU LUCRO ---
    const lucroDestaRodada = totalApostado - ganho;
    await Stats.findOneAndUpdate({}, { $inc: { lucroTotal: lucroDestaRodada } }, { upsert: true });

    const novoSaldo = Number((u.saldo + ganho).toFixed(2));

    await User.findOneAndUpdate({ user: u.user }, { 
        $set: { saldo: novoSaldo, bets: [0,0,0,0,0,0,0,0,0,0] } 
    });

    res.json({ 
        success: true, 
        corAlvo: corSorteada, 
        novoSaldo: novoSaldo, 
        valorGanho: ganho 
    });
});

// LOGIN E REGISTRO
app.post('/auth/login', async (req, res) => {
    const c = await User.findOne({ user: req.body.user, pass: req.body.pass });
    if (c) res.json({ success: true, user: c.user, saldo: c.saldo, bets: c.bets });
    else res.json({ success: false, msg: "Erro!" });
});

app.post('/auth/register', async (req, res) => {
    try {
        const novo = new User({ user: req.body.user, pass: req.body.pass });
        await novo.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// ADMIN ATUALIZADO PARA MOSTRAR O SEU LUCRO
app.post('/api/admin/list', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const users = await User.find({}, 'user saldo');
    const st = await Stats.findOne({}); // Pega o lucro lá no banco
    res.json({ success: true, users, lucroBanca: st ? st.lucroTotal : 0 });
});

app.post('/api/admin/bonus', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const u = await User.findOne({ user: req.body.user });
    if(u) {
        await User.findOneAndUpdate({ user: u.user }, { $inc: { saldo: req.body.valor } });
        res.json({ success: true });
    } else res.json({ success: false });
});

app.listen(process.env.PORT || 10000);
