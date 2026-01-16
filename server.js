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
    bets: { type: [Number], default: [0,0,0,0,0,0,0,0,0,0] } // Guarda as apostas de cada cor
}));

// TIMER DO JOGO
let tempo = 30;
setInterval(() => { if(tempo > 0) tempo--; else tempo = 30; }, 1000);
app.get('/api/tempo-real', (req, res) => res.json({ segundos: tempo }));

// SALVAR APOSTA (Muito importante para a lógica funcionar)
app.post('/api/save-saldo', async (req, res) => {
    await User.findOneAndUpdate({ user: req.body.user }, { 
        saldo: req.body.saldo, 
        bets: req.body.bets 
    });
    res.json({ success: true });
});

// LÓGICA DO GIRO (AQUI ESTÁ O SEGREDO)
app.post('/api/spin', async (req, res) => {
    const u = await User.findOne({ user: req.body.user });
    if(!u) return res.json({ success: false });

    // 1. Acha qual cor teve a MENOR aposta
    let menorValor = Math.min(...u.bets);
    let opcoesGanhadoras = [];
    
    // 2. Se tiver empate em zero, ele escolhe qualquer uma que esteja zerada
    u.bets.forEach((valor, indice) => {
        if (valor === menorValor) opcoesGanhadoras.push(indice);
    });

    // 3. Seleciona uma das cores perdedoras para o jogador (que é a ganhadora para a banca)
    const corSorteada = opcoesGanhadoras[Math.floor(Math.random() * opcoesGanhadoras.length)];
    
    // 4. Calcula quanto o jogador ganha (se ele apostou na cor que caiu)
    const valorApostadoNaCor = u.bets[corSorteada];
    const ganho = Number((valorApostadoNaCor * 5).toFixed(2)); // Paga 5x o valor
    
    const novoSaldo = Number((u.saldo + ganho).toFixed(2));

    // 5. Zera as apostas para a próxima rodada e salva o saldo
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

// LOGIN E REGISTRO (Simplificado)
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

// ADMIN E PIX (Mantidos)
app.post('/api/admin/list', async (req, res) => {
    if(req.body.senha !== SENHA_ADMIN) return res.json({ success: false });
    const users = await User.find({}, 'user saldo');
    res.json({ success: true, users });
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
